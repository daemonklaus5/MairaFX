require('dotenv').config();

class TelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
  }

  async sendMessage(message) {
    if (!this.token || !this.chatId) {
      console.log(`[Telegram Mock] ${message}`);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        console.error('Telegram failed to send:', await res.text());
      }
    } catch (e) {
      console.error('Telegram send error:', e.message);
    }
  }
}

module.exports = new TelegramBot();
