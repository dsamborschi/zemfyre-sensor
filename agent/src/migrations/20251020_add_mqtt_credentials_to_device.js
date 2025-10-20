// Migration: Add mqtt_username and mqtt_password fields to device table (SQLite3)
// Created: 2025-10-20

exports.up = function(knex) {
  return knex.schema.table('device', function(table) {
    table.string('mqttUsername');
    table.string('mqttPassword');
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', function(table) {
    table.dropColumn('mqttUsername');
    table.dropColumn('mqttPassword');
  });
};
