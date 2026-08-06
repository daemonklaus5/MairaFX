const db = require('../db');
const telegram = require('./telegram');

class AlertManager {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.activeAlerts = [];
  }

  async loadAlerts() {
    try {
      const res = await db.query(`SELECT * FROM alerts WHERE is_active = true`);
      this.activeAlerts = res.rows;
    } catch (e) {
      console.error('Failed to load alerts:', e.message);
    }
  }

  async addAlert(alert) {
    try {
      const res = await db.query(`
        INSERT INTO alerts (symbol, condition_type, target_value, target_string)
        VALUES ($1, $2, $3, $4) RETURNING *
      `, [alert.symbol, alert.condition_type, alert.target_value, alert.target_string]);
      
      this.activeAlerts.push(res.rows[0]);
      return res.rows[0];
    } catch (e) {
      console.error('Failed to add alert:', e.message);
      throw e;
    }
  }

  async checkPriceAlerts(tick) {
    const triggered = [];
    
    for (const alert of this.activeAlerts) {
      if (alert.symbol !== tick.symbol) continue;
      
      let isTriggered = false;
      if (alert.condition_type === 'PRICE_ABOVE' && tick.price >= parseFloat(alert.target_value)) {
        isTriggered = true;
      } else if (alert.condition_type === 'PRICE_BELOW' && tick.price <= parseFloat(alert.target_value)) {
        isTriggered = true;
      }

      if (isTriggered) {
        triggered.push(alert);
      }
    }

    for (const alert of triggered) {
      this.activeAlerts = this.activeAlerts.filter(a => a.id !== alert.id);
      
      // Mark inactive in DB
      await db.query(`UPDATE alerts SET is_active = false WHERE id = $1`, [alert.id]);
      
      const msg = `🚨 <b>ALERT</b>\n${alert.symbol} is now ${alert.condition_type === 'PRICE_ABOVE' ? 'above' : 'below'} ${alert.target_value}\nCurrent Price: ${tick.price}`;
      
      telegram.sendMessage(msg);
      
      if (this.wsManager) {
        this.wsManager.broadcast({ type: 'ALERT_TRIGGERED', data: alert, currentPrice: tick.price });
      }
    }
  }
}

module.exports = AlertManager;
