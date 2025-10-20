// Migration: Add mqtt_username and mqtt_password fields to device table (SQLite3)
// Created: 2025-10-20

exports.up = function(knex) {
  return knex.schema.table('device', function(table) {
    table.string('mqttBrokerUrl');
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', function(table) {
    table.dropColumn('mqttBrokerUrl');
  });
};
