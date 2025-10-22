/**
 * Customer Model
 */

import { query } from './connection';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

export interface Customer {
  id: number;
  customer_id: string;
  email: string;
  company_name?: string;
  stripe_customer_id?: string;
  api_key_hash?: string;
  api_key_created_at?: Date;
  api_key_last_used?: Date;
  created_at: Date;
  updated_at: Date;
}

export class CustomerModel {
  /**
   * Create new customer
   */
  static async create(data: {
    email: string;
    companyName?: string;
  }): Promise<Customer> {
    const customerId = `cust_${uuidv4().replace(/-/g, '')}`;
    
    const result = await query<Customer>(
      `INSERT INTO customers (customer_id, email, company_name, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [customerId, data.email, data.companyName]
    );
    
    return result.rows[0];
  }

  /**
   * Get customer by ID
   */
  static async getById(customerId: string): Promise<Customer | null> {
    const result = await query<Customer>(
      'SELECT * FROM customers WHERE customer_id = $1',
      [customerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get customer by email
   */
  static async getByEmail(email: string): Promise<Customer | null> {
    const result = await query<Customer>(
      'SELECT * FROM customers WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Get customer by Stripe customer ID
   */
  static async getByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    const result = await query<Customer>(
      'SELECT * FROM customers WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update customer
   */
  static async update(
    customerId: string,
    data: Partial<Pick<Customer, 'company_name' | 'stripe_customer_id'>>
  ): Promise<Customer> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(customerId);

    const result = await query<Customer>(
      `UPDATE customers SET ${fields.join(', ')} WHERE customer_id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * List all customers
   */
  static async list(limit: number = 100, offset: number = 0): Promise<Customer[]> {
    const result = await query<Customer>(
      'SELECT * FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Store API key (hashed) for customer
   */
  static async setApiKey(customerId: string, apiKey: string): Promise<void> {
    const hash = await bcrypt.hash(apiKey, 10);
    
    await query(
      `UPDATE customers 
       SET api_key_hash = $1, api_key_created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $2`,
      [hash, customerId]
    );
  }

  /**
   * Verify API key for customer
   */
  static async verifyApiKey(apiKey: string): Promise<Customer | null> {
    // Extract customer ID from API key (format: cust_<id>_<secret>)
    const parts = apiKey.split('_');
    if (parts.length < 3 || parts[0] !== 'cust') {
      return null;
    }
    
    const customerId = `${parts[0]}_${parts[1]}`;
    const customer = await this.getById(customerId);
    
    if (!customer || !customer.api_key_hash) {
      return null;
    }

    // Verify hash
    const isValid = await bcrypt.compare(apiKey, customer.api_key_hash);
    if (!isValid) {
      return null;
    }

    // Update last used timestamp
    await query(
      'UPDATE customers SET api_key_last_used = CURRENT_TIMESTAMP WHERE customer_id = $1',
      [customerId]
    );

    return customer;
  }

  /**
   * Revoke API key (delete hash)
   */
  static async revokeApiKey(customerId: string): Promise<void> {
    await query(
      `UPDATE customers 
       SET api_key_hash = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $1`,
      [customerId]
    );
  }
}
