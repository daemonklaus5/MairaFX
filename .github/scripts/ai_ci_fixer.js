const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

async function run() {
  try {
    const runId = process.env.RUN_ID;
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("No GEMINI_API_KEY found. Exiting.");
      process.exit(1);
    }

    console.log(`Fetching logs for run ${runId} on ${repo}...`);

    // Fetch the jobs for the run
    const jobsRes = await axios.get(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Find the failed job
    const failedJob = jobsRes.data.jobs.find(j => j.conclusion === 'failure');
    if (!failedJob) {
      console.log("No failed job found. Exiting.");
      return;
    }

    // Fetch the logs for the failed job
    const logsRes = await axios.get(`https://api.github.com/repos/${repo}/actions/jobs/${failedJob.id}/logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // We only need the bottom part of the log where the error usually is
    const logs = logsRes.data.split('\n').slice(-150).join('\n');
    console.log("Extracted error logs.");

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Use the best model for coding

    const prompt = `
You are an expert developer tasked with automatically fixing a Continuous Integration (CI) build failure.
The CI failed with the following log:

<LOG>
${logs}
</LOG>

Identify the exact file that caused the error.
Return a JSON object with two fields:
1. "file_path": The relative path to the file from the repository root (e.g., "frontend/src/App.tsx")
2. "new_content": The complete, corrected content of the file.

Do NOT include markdown formatting (\`\`\`json) in your response, just return raw parseable JSON.
If you cannot determine the fix, return an empty object {}.
    `;

    console.log("Consulting Gemini AI for a fix...");
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    
    // Clean up potential markdown wrappers
    if (text.startsWith('```json')) text = text.substring(7);
    if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.slice(0, -3);

    const fix = JSON.parse(text);

    if (fix.file_path && fix.new_content) {
      const fullPath = path.resolve(process.cwd(), fix.file_path);
      console.log(`Applying AI fix to: ${fix.file_path}`);
      fs.writeFileSync(fullPath, fix.new_content, 'utf8');
      console.log("Fix applied successfully!");
    } else {
      console.log("AI could not determine a confident fix.");
    }

  } catch (error) {
    console.error("Auto-fixer encountered an error:", error.message);
  }
}

run();
