import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import type { Transporter } from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { SES } from '@aws-sdk/client-ses';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import knex from '../database/knex';
import logger from '../utils/logger';

/**
 * Email Configuration Interface
 */
interface EmailConfig {
  enabled: boolean;
  from: string;
  debug: boolean;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };
  ses?: {
    region: string;
    sourceArn?: string;
    fromArn?: string;
  };
  transport?: any;
}

/**
 * Email Template Interface
 */
interface EmailTemplate {
  subject: HandlebarsTemplateDelegate;
  text: HandlebarsTemplateDelegate;
  html: HandlebarsTemplateDelegate;
}

/**
 * User Interface for Email
 */
interface EmailUser {
  email: string;
  name?: string;
  [key: string]: any;
}

/**
 * Email Service Class
 * Handles email sending with template support and multiple transport options
 */
class EmailService {
  private transporter: Transporter | null = null;
  private templates: Map<string, EmailTemplate> = new Map();
  private config: EmailConfig | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private exportableSettings: Record<string, any> = {};

  constructor() {
    this.init();
  }

  /**
   * Initialize email service
   */
  private async init(): Promise<void> {
    try {
      await this.loadConfig();
      await this.setupTransport();

      // Check for config changes every 5 minutes
      this.checkInterval = setInterval(async () => {
        const oldEnabled = this.config?.enabled;
        await this.loadConfig();
        
        if (oldEnabled !== this.config?.enabled && this.config?.enabled) {
          logger.info('Email configuration changed, reinitializing...');
          await this.setupTransport();
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
    }
  }

  /**
   * Load email configuration from database
   */
  private async loadConfig(): Promise<void> {
    try {
      const configRows = await knex('system_config')
        .where('key', 'like', 'email.%')
        .orWhere('key', 'system.base_url')
        .select('key', 'value');

      const configMap: Record<string, any> = {};
      configRows.forEach(row => {
        // system_config.value is JSONB, so it's already parsed
        configMap[row.key] = row.value;
      });

      this.config = {
        enabled: configMap['email.enabled'] || false,
        from: configMap['email.from'] || '"Iotistic Platform" <donotreply@iotistic.ca>',
        debug: configMap['email.debug'] || false,
      };

      // SMTP configuration
      if (configMap['email.smtp.host']) {
        this.config.smtp = {
          host: configMap['email.smtp.host'],
          port: configMap['email.smtp.port'] || 587,
          secure: configMap['email.smtp.secure'] || false,
        };

        if (configMap['email.smtp.auth.user'] && configMap['email.smtp.auth.pass']) {
          this.config.smtp.auth = {
            user: configMap['email.smtp.auth.user'],
            pass: configMap['email.smtp.auth.pass'],
          };
        }
      }

      // AWS SES configuration
      if (configMap['email.ses.region']) {
        this.config.ses = {
          region: configMap['email.ses.region'],
          sourceArn: configMap['email.ses.sourceArn'],
          fromArn: configMap['email.ses.fromArn'],
        };
      }

      logger.info(`Email configuration loaded: ${this.config.enabled ? 'ENABLED' : 'DISABLED'}`);
    } catch (error) {
      logger.error('Failed to load email config:', error);
      this.config = {
        enabled: false,
        from: '"Iotistic Platform" <donotreply@iotistic.ca>',
        debug: false,
      };
    }
  }

  /**
   * Setup email transport based on configuration
   */
  private async setupTransport(): Promise<void> {
    if (!this.config?.enabled) {
      logger.info('Email not enabled');
      return;
    }

    try {
      const mailDefaults: Mail.Options = {
        from: this.config.from,
      };

      // SMTP Transport
      if (this.config.smtp?.host) {
        this.transporter = nodemailer.createTransport(this.config.smtp, mailDefaults);
        this.exportableSettings = {
          host: this.config.smtp.host,
          port: this.config.smtp.port,
        };

        await this.transporter.verify();
        logger.info(`✅ Connected to SMTP server: ${this.config.smtp.host}:${this.config.smtp.port}`);
      }
      // AWS SES Transport
      else if (this.config.ses?.region) {
        const ses = new SES({
          apiVersion: '2010-12-01',
          region: this.config.ses.region,
          credentialDefaultProvider: defaultProvider,
        });

        if (this.config.ses.sourceArn) {
          mailDefaults.ses = {
            SourceArn: this.config.ses.sourceArn,
            FromArn: this.config.ses.fromArn || this.config.ses.sourceArn,
          } as any;
        }

        this.transporter = nodemailer.createTransport({
          SES: { ses, aws: { SES } },
        }, mailDefaults);

        this.exportableSettings = {
          region: this.config.ses.region,
        };

        await this.transporter.verify();
        logger.info(`✅ Connected to AWS SES: ${this.config.ses.region}`);
      }
      // Custom Transport
      else if (this.config.transport) {
        this.transporter = nodemailer.createTransport(this.config.transport, mailDefaults);
        this.exportableSettings = {};
        logger.info('✅ Email using custom transport');
      } else {
        logger.warn('Email enabled but no transport configured');
      }
    } catch (error) {
      logger.error('Failed to setup email transport:', error);
      this.config.enabled = false;
      this.transporter = null;
    }
  }

  /**
   * Load and compile an email template
   */
  private loadTemplate(templateName: string): EmailTemplate {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const template = require(`../postoffice/templates/${templateName}`);
      
      const compiled: EmailTemplate = {
        subject: Handlebars.compile(template.subject, { noEscape: true }),
        text: Handlebars.compile(template.text, { noEscape: true }),
        html: Handlebars.compile(template.html),
      };

      this.templates.set(templateName, compiled);
      return compiled;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);
      throw new Error(`Template ${templateName} not found`);
    }
  }

  /**
   * Register a template programmatically
   */
  public registerTemplate(templateName: string, template: { subject: string; text: string; html: string }): void {
    this.templates.set(templateName, {
      subject: Handlebars.compile(template.subject, { noEscape: true }),
      text: Handlebars.compile(template.text, { noEscape: true }),
      html: Handlebars.compile(template.html),
    });
  }

  /**
   * Sanitize text for email clients
   */
  private sanitizeText(value: string): { text: string; html: string } {
    return {
      text: value.replace(/\./g, ' '),
      html: value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\./g, '<br style="display: none;"/>.'),
    };
  }

  /**
   * Sanitize log entries for email
   */
  private sanitizeLog(log: Array<{ ts: number; level: string; msg: string }>): {
    text: Array<{ timestamp: string; level: string; message: string }>;
    html: Array<{ timestamp: string; level: string; message: string }>;
  } {
    const isoTime = (ts: number): string => {
      if (!ts) return '';
      try {
        const actualTs = ts > 99999999999999 ? ts / 10000 : ts;
        const dt = new Date(actualTs);
        const str = dt.toISOString().replace('T', ' ').replace('Z', '');
        return str.substring(0, str.length - 4);
      } catch {
        return '';
      }
    };

    const htmlEscape = (str: string): string =>
      (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return {
      text: log.map(entry => ({
        timestamp: entry.ts ? isoTime(+entry.ts) : '',
        level: entry.level || '',
        message: entry.msg || '',
      })),
      html: log.map(entry => ({
        timestamp: entry.ts ? isoTime(+entry.ts) : '',
        level: htmlEscape(entry.level || ''),
        message: htmlEscape(entry.msg || ''),
      })),
    };
  }

  /**
   * Send an email using a template
   */
  public async send(user: EmailUser, templateName: string, context: Record<string, any> = {}): Promise<void> {
    if (!this.config?.enabled || !this.transporter) {
      if (this.config?.debug) {
        logger.warn('Email not enabled, skipping send');
      }
      return;
    }

    try {
      // Get base URL from config
      const baseUrlRow = await knex('config').where('key', 'system.base_url').first();
      const baseURL = baseUrlRow ? JSON.parse(baseUrlRow.value) : 'http://localhost:3001';

      const template = this.loadTemplate(templateName);
      
      const templateContext: Record<string, any> = {
        baseURL,
        forgeURL: baseURL, // Legacy alias
        user,
        ...context,
      };

      // Sanitize user name
      templateContext.safeName = this.sanitizeText(user.name || 'user');

      // Sanitize optional fields
      if (templateContext.teamName) {
        templateContext.teamName = this.sanitizeText(templateContext.teamName);
      }
      if (templateContext.invitee) {
        templateContext.invitee = this.sanitizeText(templateContext.invitee);
      }

      // Sanitize log if present
      if (Array.isArray(templateContext.log) && templateContext.log.length > 0) {
        templateContext.log = this.sanitizeLog(templateContext.log);
      } else {
        delete templateContext.log;
      }

      const handlebarsOptions = {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true,
      };

      // Load default layout
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const defaultLayout = require('../postoffice/layout/default');

      const mail: Mail.Options = {
        to: user.email,
        subject: template.subject(templateContext, handlebarsOptions),
        text: template.text(templateContext, handlebarsOptions),
        html: defaultLayout(template.html(templateContext, handlebarsOptions)),
      };

      await this.transporter.sendMail(mail);
      logger.info(`📧 Email sent to ${user.email}: ${mail.subject}`);

      if (this.config.debug) {
        console.log(`
-----------------------------------
to: ${mail.to}
subject: ${mail.subject}
------
${mail.text}
-----------------------------------`);
      }
    } catch (error) {
      logger.error(`Failed to send email to ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Check if email is enabled
   */
  public enabled(): boolean {
    return this.config?.enabled || false;
  }

  /**
   * Export email settings (for API)
   */
  public exportSettings(isAdmin: boolean = false): boolean | Record<string, any> {
    if (!this.config?.enabled) {
      return false;
    }
    return isAdmin ? this.exportableSettings : true;
  }

  /**
   * Update email configuration
   */
  public async updateConfig(key: string, value: any): Promise<void> {
    await knex('config')
      .where('key', key)
      .update({
        value: JSON.stringify(value),
        updated_at: knex.fn.now(),
      });

    await this.loadConfig();
    if (key.startsWith('email.')) {
      await this.setupTransport();
    }
  }

  /**
   * Cleanup on shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.transporter) {
      this.transporter.close();
    }
    logger.info('Email service shut down');
  }
}

// Export singleton instance
export default new EmailService();
