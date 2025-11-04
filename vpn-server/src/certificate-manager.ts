/**
 * Certificate Manager for VPN Server
 * Handles PKI operations including CA management, certificate generation, and revocation
 */

import * as forge from 'node-forge';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  CertificateInfo, 
  DeviceCertificateRequest, 
  DeviceCertificateResponse,
  CertificateRevocationRequest,
  PKIConfig,
  Logger 
} from './types';

export class CertificateManager {
  private caCert?: forge.pki.Certificate;
  private caKey?: forge.pki.rsa.PrivateKey;
  private tlsAuthKey?: string;
  private certificates = new Map<string, CertificateInfo>();

  constructor(
    private config: PKIConfig,
    private logger: Logger
  ) {}

  /**
   * Initialize the certificate manager
   */
  async initialize(): Promise<void> {
    try {
      await this.loadCA();
      await this.loadTLSAuthKey();
      await this.loadExistingCertificates();
      this.logger.info('Certificate manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize certificate manager', { error });
      throw error;
    }
  }

  /**
   * Generate a new device certificate
   */
  async generateDeviceCertificate(request: DeviceCertificateRequest): Promise<DeviceCertificateResponse> {
    if (!this.caCert || !this.caKey) {
      throw new Error('CA not loaded');
    }

    const { deviceId, customerId, validityDays = this.config.certValidityDays } = request;
    const commonName = this.generateCommonName(deviceId, customerId);

    this.logger.info('Generating device certificate', { deviceId, customerId, commonName });

    try {
      // Generate key pair
      const keys = forge.pki.rsa.generateKeyPair(this.config.keySize);
      
      // Create certificate
      const cert = forge.pki.createCertificate();
      const serialNumber = this.generateSerialNumber();

      cert.publicKey = keys.publicKey;
      cert.serialNumber = serialNumber;
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);

      // Set subject
      const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'organizationName', value: `Iotistic-Customer-${customerId}` },
        { name: 'organizationalUnitName', value: 'IoT-Device' },
        { name: 'countryName', value: 'CA' }
      ];
      cert.setSubject(attrs);
      cert.setIssuer(this.caCert.subject.attributes);

      // Add extensions
      cert.setExtensions([
        {
          name: 'basicConstraints',
          cA: false
        },
        {
          name: 'keyUsage',
          keyCertSign: false,
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true,
          dataEncipherment: true
        },
        {
          name: 'extKeyUsage',
          clientAuth: true
        },
        {
          name: 'subjectAltName',
          altNames: [
            {
              type: 2, // DNS
              value: `device-${deviceId}.iotistic.internal`
            },
            {
              type: 7, // IP
              ip: '127.0.0.1'
            }
          ]
        }
      ]);

      // Sign certificate
      cert.sign(this.caKey, forge.md.sha256.create());

      // Convert to PEM format
      const certPem = forge.pki.certificateToPem(cert);
      const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
      const caPem = forge.pki.certificateToPem(this.caCert);

      // Store certificate info
      const certInfo: CertificateInfo = {
        serialNumber,
        commonName,
        deviceId,
        customerId,
        issuedAt: cert.validity.notBefore,
        expiresAt: cert.validity.notAfter,
        revoked: false
      };
      this.certificates.set(serialNumber, certInfo);

      // Generate client configuration
      const clientConfig = await this.generateClientConfig(certPem, keyPem, caPem);

      const response: DeviceCertificateResponse = {
        deviceId,
        customerId,
        commonName,
        certificate: certPem,
        privateKey: keyPem,
        caCertificate: caPem,
        tlsAuthKey: this.tlsAuthKey || '',
        clientConfig,
        serialNumber,
        expiresAt: cert.validity.notAfter
      };

      // Save certificate to filesystem
      await this.saveCertificateFiles(deviceId, response);

      this.logger.info('Device certificate generated successfully', { 
        deviceId, 
        customerId, 
        serialNumber,
        expiresAt: cert.validity.notAfter
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to generate device certificate', { deviceId, customerId, error });
      throw error;
    }
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(request: CertificateRevocationRequest): Promise<void> {
    const { serialNumber, deviceId, reason = 'unspecified' } = request;
    
    let targetSerial = serialNumber;
    if (!targetSerial && deviceId) {
      // Find certificate by device ID
      for (const [serial, cert] of this.certificates.entries()) {
        if (cert.deviceId === deviceId) {
          targetSerial = serial;
          break;
        }
      }
    }

    if (!targetSerial) {
      throw new Error('Certificate not found');
    }

    const certInfo = this.certificates.get(targetSerial);
    if (!certInfo) {
      throw new Error('Certificate not found in registry');
    }

    if (certInfo.revoked) {
      this.logger.warn('Certificate already revoked', { serialNumber: targetSerial });
      return;
    }

    this.logger.info('Revoking certificate', { 
      serialNumber: targetSerial, 
      deviceId: certInfo.deviceId,
      reason 
    });

    try {
      // Mark as revoked
      certInfo.revoked = true;
      certInfo.revokedAt = new Date();

      // Update CRL
      await this.updateCRL();

      this.logger.info('Certificate revoked successfully', { 
        serialNumber: targetSerial, 
        deviceId: certInfo.deviceId 
      });
    } catch (error) {
      this.logger.error('Failed to revoke certificate', { serialNumber: targetSerial, error });
      throw error;
    }
  }

  /**
   * Get certificate information
   */
  getCertificate(serialNumber: string): CertificateInfo | undefined {
    return this.certificates.get(serialNumber);
  }

  /**
   * Get all certificates for a customer
   */
  getCustomerCertificates(customerId: string): CertificateInfo[] {
    return Array.from(this.certificates.values())
      .filter(cert => cert.customerId === customerId);
  }

  /**
   * Get certificates expiring soon
   */
  getCertificatesExpiringSoon(days: number = 30): CertificateInfo[] {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    return Array.from(this.certificates.values())
      .filter(cert => !cert.revoked && cert.expiresAt <= threshold);
  }

  /**
   * Load CA certificate and key
   */
  private async loadCA(): Promise<void> {
    try {
      const caCertPem = await fs.readFile(this.config.caCertPath, 'utf8');
      const caKeyPem = await fs.readFile(this.config.caKeyPath, 'utf8');

      this.caCert = forge.pki.certificateFromPem(caCertPem);
      this.caKey = forge.pki.privateKeyFromPem(caKeyPem);

      this.logger.info('CA certificate loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load CA certificate', { error });
      throw new Error('Failed to load CA certificate');
    }
  }

  /**
   * Load TLS auth key
   */
  private async loadTLSAuthKey(): Promise<void> {
    try {
      this.tlsAuthKey = await fs.readFile(this.config.taKeyPath, 'utf8');
      this.logger.info('TLS auth key loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load TLS auth key', { error });
      throw new Error('Failed to load TLS auth key');
    }
  }

  /**
   * Load existing certificates from filesystem
   */
  private async loadExistingCertificates(): Promise<void> {
    // This would typically load from database in production
    this.logger.info('Certificate registry initialized (empty)');
  }

  /**
   * Generate common name for device certificate
   */
  private generateCommonName(deviceId: string, customerId: string): string {
    return `device-${deviceId}-${customerId}`;
  }

  /**
   * Generate unique serial number
   */
  private generateSerialNumber(): string {
    return Math.floor(Math.random() * 1000000000).toString(16).toUpperCase();
  }

  /**
   * Generate OpenVPN client configuration
   */
  private async generateClientConfig(
    certPem: string, 
    keyPem: string, 
    caPem: string
  ): Promise<string> {
    const template = await fs.readFile(
      path.join(path.dirname(this.config.caCertPath), '..', 'config', 'client-template.conf'),
      'utf8'
    );

    return template
      .replace('VPN_SERVER_HOST', process.env.VPN_SERVER_HOST || 'localhost')
      .replace('VPN_SERVER_PORT', process.env.VPN_SERVER_PORT || '1194')
      .replace('<ca>', caPem.trim())
      .replace('<cert>', certPem.trim())
      .replace('<key>', keyPem.trim())
      .replace('<tls-auth>', (this.tlsAuthKey || '').trim());
  }

  /**
   * Save certificate files to filesystem
   */
  private async saveCertificateFiles(
    deviceId: string, 
    response: DeviceCertificateResponse
  ): Promise<void> {
    const certDir = path.join(path.dirname(this.config.caCertPath), 'issued');
    const keyDir = path.join(path.dirname(this.config.caCertPath), 'private');
    const configDir = path.join(path.dirname(this.config.caCertPath), 'client-configs');

    // Ensure directories exist
    await fs.mkdir(certDir, { recursive: true });
    await fs.mkdir(keyDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });

    // Save certificate and key
    await fs.writeFile(path.join(certDir, `${deviceId}.crt`), response.certificate);
    await fs.writeFile(path.join(keyDir, `${deviceId}.key`), response.privateKey);
    await fs.writeFile(path.join(configDir, `${deviceId}.ovpn`), response.clientConfig);
  }

  /**
   * Update Certificate Revocation List
   */
  private async updateCRL(): Promise<void> {
    if (!this.caCert || !this.caKey) {
      throw new Error('CA not loaded');
    }

    const crl = forge.pki.createCaStore();
    const revokedCerts = Array.from(this.certificates.values())
      .filter(cert => cert.revoked);

    // This is a simplified CRL generation
    // In production, you'd want to use proper CRL generation
    const crlData = revokedCerts.map(cert => ({
      serialNumber: cert.serialNumber,
      revocationDate: cert.revokedAt || new Date()
    }));

    this.logger.info('CRL updated', { revokedCount: revokedCerts.length });

    // Save CRL to file
    await fs.writeFile(this.config.crlPath, JSON.stringify(crlData, null, 2));
  }
}