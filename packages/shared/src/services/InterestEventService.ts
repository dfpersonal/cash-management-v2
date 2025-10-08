import { Database } from 'sqlite3';
import {
  InterestEventConfig,
  InterestPaymentEvent,
  InterestPaymentType
} from '../types/TransactionTypes';
import { Deposit } from '../types/PortfolioTypes';
import { InterestPaymentService } from './InterestPaymentService';

export class InterestEventService {
  private db: Database;
  private interestPaymentService: InterestPaymentService;

  constructor(database: Database) {
    this.db = database;
    this.interestPaymentService = new InterestPaymentService(database);
  }

  /**
   * Load configuration from unified_config
   */
  async getConfig(): Promise<InterestEventConfig> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT config_key, config_value, config_type
        FROM unified_config
        WHERE category = 'events' AND is_active = 1
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const config: any = {};
        rows.forEach(row => {
          let value = row.config_value;
          if (row.config_type === 'boolean') {
            value = value === 'true';
          } else if (row.config_type === 'number') {
            value = parseFloat(value);
          }
          
          // Map database keys to config object
          const key = row.config_key.replace('interest_events_', '').replace('interest_event_', '');
          if (key === 'enabled') config.enabled = value;
          else if (key === 'monthly') config.include_monthly = value;
          else if (key === 'annual') config.include_annual = value;
          else if (key === 'fixed_date') config.include_fixed_date = value;
          else if (key === 'maturity') config.include_maturity = value;
          else if (key === 'days_before') config.days_before = value;
          else if (key === 'missed_payment_alert_days') config.missed_payment_alert_days = value;
        });

        resolve({
          enabled: config.enabled ?? true,
          include_monthly: config.include_monthly ?? false,
          include_annual: config.include_annual ?? true,
          include_fixed_date: config.include_fixed_date ?? true,
          include_maturity: config.include_maturity ?? true,
          days_before: config.days_before ?? 2,
          missed_payment_alert_days: config.missed_payment_alert_days ?? 3
        });
      });
    });
  }

  /**
   * Update configuration in unified_config
   */
  async updateConfig(key: string, value: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const fullKey = key.startsWith('interest_') ? key : `interest_events_${key}`;
      
      const query = `
        UPDATE unified_config
        SET config_value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE config_key = ?
      `;

      this.db.run(query, [value, fullKey], function(err) {
        if (err) {
          resolve({ success: false, error: err.message });
        } else if (this.changes === 0) {
          resolve({ success: false, error: 'Configuration key not found' });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Check if event should be generated for payment type
   */
  async shouldGenerateEvent(paymentType?: InterestPaymentType): Promise<boolean> {
    if (!paymentType) return false;
    
    const config = await this.getConfig();
    
    if (!config.enabled) return false;
    
    switch(paymentType) {
      case 'Monthly':
        return config.include_monthly;
      case 'Annually':
        return config.include_annual;
      case 'Fixed_Date':
        return config.include_fixed_date;
      case 'At_Maturity':
        return config.include_maturity;
      default:
        return false;
    }
  }

  /**
   * Generate interest payment reminder
   */
  async generateInterestEvent(account: Deposit & any): Promise<{ success: boolean; error?: string }> {
    if (!await this.shouldGenerateEvent(account.interest_payment_type)) {
      return { success: false, error: 'Event generation disabled for this payment type' };
    }
    
    const config = await this.getConfig();
    const nextPaymentDate = this.interestPaymentService.calculateNextPaymentDate(account);
    
    if (!nextPaymentDate) {
      return { success: false, error: 'Could not calculate next payment date' };
    }
    
    // Calculate reminder date (days before payment)
    const reminderDate = new Date(nextPaymentDate);
    reminderDate.setDate(reminderDate.getDate() - config.days_before);
    
    const estimatedAmount = this.interestPaymentService.calculateEstimatedInterest(account);
    
    // Create reminder in the reminders table
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO reminders (
          deposit_id,
          reminder_type,
          lead_days,
          reminder_date,
          title,
          description,
          priority,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const title = this.getEventTitle(account);
      const description = this.getEventDescription(account, estimatedAmount, nextPaymentDate);
      
      const params = [
        account.id,
        'INTEREST_PAYMENT',
        config.days_before,
        reminderDate.toISOString().split('T')[0],
        title,
        description,
        account.interest_payment_type === 'At_Maturity' ? 'high' : 'medium'
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Generate appropriate event title
   */
  private getEventTitle(account: Deposit & any): string {
    switch(account.interest_payment_type) {
      case 'Monthly':
        return `Monthly interest from ${account.bank} due soon`;
      case 'Annually':
        return `Annual interest from ${account.bank} due soon`;
      case 'Fixed_Date':
        const day = account.interest_fixed_payment_day;
        const month = this.getMonthName(account.interest_fixed_payment_month);
        return `Interest from ${account.bank} due around ${day} ${month}`;
      case 'At_Maturity':
        return `${account.bank} term deposit maturing soon`;
      default:
        return `Interest from ${account.bank} due soon`;
    }
  }

  /**
   * Generate detailed event description
   */
  private getEventDescription(
    account: Deposit & any,
    estimatedAmount: number,
    paymentDate: Date
  ): string {
    const lines = [
      `Estimated interest: £${estimatedAmount.toFixed(2)}`,
      `Account: ${account.account_name || account.type}`,
      `Current balance: £${(account.balance || 0).toLocaleString()}`,
      `Rate: ${account.aer}% AER`,
      `Payment date: ${paymentDate.toLocaleDateString('en-GB')}`
    ];
    
    if (account.interest_payment_destination && account.interest_payment_destination !== 'Same_Account') {
      lines.push(`Payment to: ${this.getDestinationDescription(account)}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get destination description for display
   */
  private getDestinationDescription(account: any): string {
    switch(account.interest_payment_destination) {
      case 'Other_Account_Same_Bank':
        return `Another account at ${account.bank}`;
      case 'Designated_Account':
        return 'Designated current account';
      default:
        return 'Same account';
    }
  }

  /**
   * Get month name
   */
  private getMonthName(month?: number): string {
    if (!month || month < 1 || month > 12) return '';
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return monthNames[month - 1];
  }

  /**
   * Check for missed interest payments
   */
  async checkMissedPayments(): Promise<any[]> {
    const config = await this.getConfig();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          md.id,
          md.bank,
          md.account_name,
          md.interest_payment_type,
          md.interest_next_payment_date,
          md.balance,
          md.aer,
          JULIANDAY('now') - JULIANDAY(md.interest_next_payment_date) as days_overdue
        FROM my_deposits md
        WHERE md.is_active = 1
          AND md.interest_payment_type IS NOT NULL
          AND md.interest_next_payment_date IS NOT NULL
          AND JULIANDAY('now') - JULIANDAY(md.interest_next_payment_date) > ?
          AND NOT EXISTS (
            SELECT 1 FROM account_transactions at
            WHERE at.account_id = md.id
              AND at.transaction_type = 'interest'
              AND at.bank_date >= md.interest_next_payment_date
          )
      `;

      this.db.all(query, [config.missed_payment_alert_days], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Create alert for missed payment
   */
  async createMissedPaymentAlert(account: any): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO reminders (
          deposit_id,
          reminder_type,
          reminder_date,
          title,
          description,
          priority,
          created_at
        ) VALUES (?, ?, DATE('now'), ?, ?, 'urgent', CURRENT_TIMESTAMP)
      `;

      const title = `Possible missed interest payment - ${account.bank}`;
      const description = [
        `Interest was due ${Math.floor(account.days_overdue)} days ago`,
        `Account: ${account.account_name || 'Savings'}`,
        `Expected amount: £${this.interestPaymentService.calculateEstimatedInterest(account).toFixed(2)}`,
        'Action required: Check account and record transaction if received'
      ].join('\n');

      this.db.run(
        query,
        [account.id, 'MISSED_INTEREST', title, description],
        function(err) {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  }

  /**
   * Get all pending interest events
   */
  async getPendingInterestEvents(daysAhead: number = 30): Promise<InterestPaymentEvent[]> {
    const accounts = await this.interestPaymentService.getUpcomingInterestPayments(daysAhead);
    const config = await this.getConfig();
    
    const events: InterestPaymentEvent[] = [];
    
    for (const account of accounts) {
      if (await this.shouldGenerateEvent(account.interest_payment_type)) {
        const nextPaymentDate = this.interestPaymentService.calculateNextPaymentDate(account);
        if (nextPaymentDate) {
          const reminderDate = new Date(nextPaymentDate);
          reminderDate.setDate(reminderDate.getDate() - config.days_before);
          
          events.push({
            account_id: account.id,
            bank_name: account.bank,
            account_name: account.account_name,
            payment_type: account.interest_payment_type,
            expected_date: nextPaymentDate.toISOString().split('T')[0],
            estimated_amount: this.interestPaymentService.calculateEstimatedInterest(account),
            reminder_date: reminderDate.toISOString().split('T')[0],
            auto_generated: true,
            recurring: account.interest_payment_type !== 'At_Maturity'
          });
        }
      }
    }
    
    return events;
  }

  /**
   * Process all pending events
   */
  async processAllPendingEvents(): Promise<{ created: number; errors: string[] }> {
    const events = await this.getPendingInterestEvents();
    let created = 0;
    const errors: string[] = [];
    
    for (const event of events) {
      // Check if reminder already exists
      const exists = await this.reminderExists(event.account_id, event.expected_date);
      
      if (!exists) {
        const account = await this.getAccountById(event.account_id);
        if (account) {
          const result = await this.generateInterestEvent(account);
          if (result.success) {
            created++;
          } else if (result.error) {
            errors.push(`Account ${event.account_id}: ${result.error}`);
          }
        }
      }
    }
    
    return { created, errors };
  }

  /**
   * Check if reminder already exists
   */
  private async reminderExists(accountId: number, paymentDate: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM reminders
        WHERE deposit_id = ?
          AND reminder_type = 'INTEREST_PAYMENT'
          AND ABS(JULIANDAY(reminder_date) - JULIANDAY(?)) <= 7
          AND is_dismissed = 0
      `;

      this.db.get(query, [accountId, paymentDate], (err, row: any) => {
        if (err) {
          resolve(false);
        } else {
          resolve(row?.count > 0);
        }
      });
    });
  }

  /**
   * Get account by ID
   */
  private async getAccountById(accountId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM my_deposits WHERE id = ?',
        [accountId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  /**
   * Generate calendar events for all configured interest payments
   */
  async generateInterestCalendarEvents(months: number = 12): Promise<{
    created: number;
    updated: number;
    errors: string[];
  }> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return { created: 0, updated: 0, errors: ['Interest event generation is disabled'] };
    }

    const accounts = await this.interestPaymentService.getUpcomingInterestPayments(months * 30);
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      if (!await this.shouldGenerateEvent(account.interest_payment_type)) {
        continue;
      }

      try {
        const events = await this.generateEventsForAccount(account, months);
        created += events.created;
        updated += events.updated;
      } catch (error) {
        errors.push(`Failed to generate events for account ${account.id}: ${error}`);
      }
    }

    return { created, updated, errors };
  }

  /**
   * Generate events for a specific account
   */
  private async generateEventsForAccount(
    account: Deposit & any,
    months: number
  ): Promise<{ created: number; updated: number }> {
    const config = await this.getConfig();
    let created = 0;
    let updated = 0;

    // Calculate payment dates based on type
    const paymentDates = this.calculatePaymentDates(account, months);

    for (const paymentDate of paymentDates) {
      const reminderDate = new Date(paymentDate);
      reminderDate.setDate(reminderDate.getDate() - config.days_before);

      // Check if event already exists
      const existingEvent = await this.getExistingEvent(account.id, paymentDate);

      if (existingEvent) {
        // Update existing event
        await this.updateCalendarEvent(existingEvent.id, {
          estimated_amount: this.interestPaymentService.calculateEstimatedInterest(account),
          reminder_date: reminderDate.toISOString().split('T')[0]
        });
        updated++;
      } else {
        // Create new event
        await this.createCalendarEvent({
          account_id: account.id,
          bank_name: account.bank,
          account_name: account.account_name || account.type,
          payment_type: account.interest_payment_type,
          expected_date: paymentDate.toISOString().split('T')[0],
          estimated_amount: this.interestPaymentService.calculateEstimatedInterest(account),
          reminder_date: reminderDate.toISOString().split('T')[0],
          current_aer: account.aer
        });
        created++;
      }
    }

    return { created, updated };
  }

  /**
   * Calculate payment dates for an account
   */
  private calculatePaymentDates(account: Deposit & any, months: number): Date[] {
    const dates: Date[] = [];
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + months);

    switch (account.interest_payment_type) {
      case 'Monthly':
        let monthlyDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); // End of current month
        while (monthlyDate <= endDate) {
          dates.push(new Date(monthlyDate));
          monthlyDate.setMonth(monthlyDate.getMonth() + 1);
        }
        break;

      case 'Annually':
        if (account.deposit_date) {
          const depositDate = new Date(account.deposit_date);
          let annualDate = new Date(today.getFullYear(), depositDate.getMonth(), depositDate.getDate());
          if (annualDate < today) {
            annualDate.setFullYear(annualDate.getFullYear() + 1);
          }
          while (annualDate <= endDate) {
            dates.push(new Date(annualDate));
            annualDate.setFullYear(annualDate.getFullYear() + 1);
          }
        }
        break;

      case 'Fixed_Date':
        if (account.interest_fixed_payment_day && account.interest_fixed_payment_month) {
          let fixedDate = new Date(
            today.getFullYear(),
            account.interest_fixed_payment_month - 1,
            account.interest_fixed_payment_day
          );
          if (fixedDate < today) {
            fixedDate.setFullYear(fixedDate.getFullYear() + 1);
          }
          while (fixedDate <= endDate) {
            dates.push(new Date(fixedDate));
            fixedDate.setFullYear(fixedDate.getFullYear() + 1);
          }
        }
        break;

      case 'At_Maturity':
        if (account.term_ends) {
          const maturityDate = new Date(account.term_ends);
          if (maturityDate >= today && maturityDate <= endDate) {
            dates.push(maturityDate);
          }
        }
        break;
    }

    return dates;
  }

  /**
   * Check for existing event
   */
  private async getExistingEvent(accountId: number, date: Date): Promise<any> {
    return new Promise((resolve) => {
      const query = `
        SELECT * FROM interest_payment_events
        WHERE account_id = ? AND expected_date = DATE(?)
      `;

      this.db.get(query, [accountId, date.toISOString()], (err, row) => {
        if (err) {
          console.error('Error checking existing event:', err);
          resolve(null);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Create calendar event
   */
  private async createCalendarEvent(event: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO interest_payment_events (
          account_id, bank_name, account_name, payment_type,
          expected_date, estimated_amount, reminder_date, current_aer,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      this.db.run(query, [
        event.account_id,
        event.bank_name,
        event.account_name,
        event.payment_type,
        event.expected_date,
        event.estimated_amount,
        event.reminder_date,
        event.current_aer
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Update calendar event
   */
  private async updateCalendarEvent(eventId: number, updates: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const updateFields: string[] = [];
      const params: any[] = [];

      if (updates.estimated_amount !== undefined) {
        updateFields.push('estimated_amount = ?');
        params.push(updates.estimated_amount);
      }
      if (updates.reminder_date !== undefined) {
        updateFields.push('reminder_date = ?');
        params.push(updates.reminder_date);
      }

      if (updateFields.length === 0) {
        resolve();
        return;
      }

      params.push(eventId);
      const query = `
        UPDATE interest_payment_events
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Process missed payments
   */
  async processMissedPayments(): Promise<number> {
    const config = await this.getConfig();
    const missedAccounts = await this.interestPaymentService.detectMissedPayments(config.missed_payment_alert_days);
    
    let alertsCreated = 0;
    for (const account of missedAccounts) {
      const result = await this.createMissedPaymentAlert(account);
      if (result.success) {
        alertsCreated++;
      }
    }

    return alertsCreated;
  }
}