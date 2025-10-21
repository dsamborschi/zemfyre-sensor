import type { Knex } from 'knex';

/**
 * Migration: Add email configuration to system_config table
 */
export async function up(knex: Knex): Promise<void> {
  // Insert default email configuration into system_config
  const emailConfig = [
    {
      key: 'email.enabled',
      value: JSON.stringify(false),
    },
    {
      key: 'email.from',
      value: JSON.stringify('"Iotistic Platform" <donotreply@iotistic.ca>'),
    },
    {
      key: 'email.debug',
      value: JSON.stringify(false),
    },
    {
      key: 'email.smtp.host',
      value: JSON.stringify(''),
    },
    {
      key: 'email.smtp.port',
      value: JSON.stringify(587),
    },
    {
      key: 'email.smtp.secure',
      value: JSON.stringify(false),
    },
    {
      key: 'email.smtp.auth.user',
      value: JSON.stringify(''),
    },
    {
      key: 'email.smtp.auth.pass',
      value: JSON.stringify(''),
    },
    {
      key: 'email.ses.region',
      value: JSON.stringify('us-east-1'),
    },
    {
      key: 'email.ses.sourceArn',
      value: JSON.stringify(''),
    },
    {
      key: 'system.base_url',
      value: JSON.stringify('http://localhost:3001'),
    },
  ];

  for (const config of emailConfig) {
    const existing = await knex('system_config').where('key', config.key).first();
    if (!existing) {
      await knex('system_config').insert(config);
    }
  }

  console.log('✅ Email configuration added to system_config');
}

export async function down(knex: Knex): Promise<void> {
  await knex('system_config')
    .whereIn('key', [
      'email.enabled',
      'email.from',
      'email.debug',
      'email.smtp.host',
      'email.smtp.port',
      'email.smtp.secure',
      'email.smtp.auth.user',
      'email.smtp.auth.pass',
      'email.ses.region',
      'email.ses.sourceArn',
      'system.base_url',
    ])
    .delete();
}
