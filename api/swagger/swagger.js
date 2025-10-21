// swagger.js
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { version } = require('../../package.json');
const fs = require('fs');
const path = require('path');


/**
 * @swagger
 * /api/v1/settings:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get server settings
 *     description: Returns basic server settings and status
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 settings:
 *                   type: object
 */

/**
 * @swagger
 * /api/v1/devices:
 *   get:
 *     tags:
 *       - Devices
 *     summary: Get all devices
 *     description: Fetch all devices from the database
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     type: object
 */

/**
 * @swagger
 * /api/v1/devices:
 *   post:
 *     tags:
 *       - Devices
 *     summary: Provision a new device
 *     description: Creates a new device and saves it to the database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               setup:
 *                 type: boolean
 *               agentHost:
 *                 type: string
 *     responses:
 *       201:
 *         description: Device provisioned successfully
 *       500:
 *         description: Error saving device to database
 */

/**
 * @swagger
 * /api/v1/otc:
 *   post:
 *     tags:
 *       - Tokens
 *     summary: Generate a new OTC
 *     description: Generates a new OTC for a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *     responses:
 *       201:
 *         description: OTC generated successfully
 *       400:
 *         description: Customer ID is required
 *       404:
 *         description: Customer not found
 *       403:
 *         description: Device limit reached
 *       500:
 *         description: Error generating OTC
 */

/**
 * @swagger
 * /api/v1/otc/verify:
 *   post:
 *     tags:
 *       - Tokens
 *     summary: Verify an OTC
 *     description: Verifies if an OTC is valid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTC verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *       400:
 *         description: OTC is required
 *       500:
 *         description: Error verifying OTC
 */

/**
 * @swagger
 * /api/v1/customers:
 *   post:
 *     tags:
 *       - Customers
 *     summary: Save customer data
 *     description: Creates a new customer and saves it to the database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               maxDevices:
 *                 type: number
 *               planId:
 *                 type: number
 *               issuedOTCs:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Customer saved successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Error saving customer
 */

// Swagger options
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Iotistic Cloud API',
      version: version,
      description: 'API documentation for the Iotistic Cloud API service',
    },
  },
  apis: [path.join(__dirname, '../index.js')], // Adjust path to your route files
};

// Init swagger docs and custom CSS
const swaggerDocs = swaggerJsDoc(swaggerOptions);
const customCss = fs.readFileSync(path.join(__dirname, './swagger-custom.css'), 'utf8');

module.exports = {
  swaggerUi,
  swaggerDocs,
  customCss,
};
