/**
 * Email service for sending magic link codes
 */

import nodemailer from 'nodemailer';
// @ts-ignore - no types available for mailgun transport
import mg from 'nodemailer-mailgun-transport';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@hgraph.ai';
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || '';
const USE_MAILGUN = !!(MAILGUN_API_KEY && MAILGUN_DOMAIN);

// Fallback SMTP configuration
const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

// Log file path
const LOG_FILE = join(process.cwd(), 'email-auth-log.txt');

// Initialize log file if it doesn't exist
if (!existsSync(LOG_FILE)) {
  writeFileSync(LOG_FILE, `Email Authentication Log\nStarted: ${new Date().toISOString()}\n${'='.repeat(50)}\n\n`);
}

// Create transporter
const transporter = USE_MAILGUN 
  ? nodemailer.createTransport(mg({
      auth: {
        api_key: MAILGUN_API_KEY,
        domain: MAILGUN_DOMAIN,
      },
    }))
  : nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER && SMTP_PASS ? {
        user: SMTP_USER,
        pass: SMTP_PASS,
      } : undefined,
      // For development/testing without real SMTP
      ignoreTLS: true,
      tls: {
        rejectUnauthorized: false,
      },
    });

// Log which email service is being used
console.log(USE_MAILGUN 
  ? `📧 Email service: Mailgun (domain: ${MAILGUN_DOMAIN})`
  : `📧 Email service: SMTP (${SMTP_HOST}:${SMTP_PORT})`);

/**
 * Log email authentication attempts
 */
export function logEmailAttempt(
  email: string,
  action: 'attempt' | 'success' | 'failed' | 'expired',
  details?: string,
): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${action.toUpperCase()}: ${email}${details ? ` - ${details}` : ''}\n`;
  
  try {
    appendFileSync(LOG_FILE, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

/**
 * Send magic link code via email
 */
export async function sendMagicCode(
  email: string,
  code: string,
  ipAddress?: string,
): Promise<boolean> {
  const subject = 'Your Hgraph AI Login Code';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .code-box { 
          background: #f5f5f5; 
          border: 2px solid #007bff; 
          border-radius: 8px; 
          padding: 20px; 
          margin: 20px 0; 
          text-align: center; 
        }
        .code { 
          font-size: 32px; 
          font-weight: bold; 
          color: #007bff; 
          letter-spacing: 5px; 
        }
        .footer { 
          margin-top: 30px; 
          padding-top: 20px; 
          border-top: 1px solid #ddd; 
          font-size: 12px; 
          color: #666; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔐 Your Login Code</h2>
        <p>You requested a login code for Hgraph AI. Enter this code to complete your login:</p>
        
        <div class="code-box">
          <div class="code">${code}</div>
        </div>
        
        <p><strong>This code will expire in 10 minutes.</strong></p>
        <p>If you didn't request this code, please ignore this email.</p>
        
        <div class="footer">
          <p>Security Information:</p>
          <ul>
            <li>Request from IP: ${ipAddress || 'Unknown'}</li>
            <li>Time: ${new Date().toLocaleString()}</li>
          </ul>
          <p>© ${new Date().getFullYear()} Hgraph AI</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Your Hgraph AI Login Code

Your login code is: ${code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

Security Information:
- Request from IP: ${ipAddress || 'Unknown'}
- Time: ${new Date().toLocaleString()}
  `;

  try {
    // Log the attempt
    logEmailAttempt(email, 'attempt', ipAddress ? `IP: ${ipAddress}` : undefined);

    // Send email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject,
      text,
      html,
    });

    console.log(`Magic code sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    logEmailAttempt(email, 'failed', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // In development, log the code to console if email fails
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`DEVELOPMENT MODE - Magic Code for ${email}: ${code}`);
      console.log(`${'='.repeat(50)}\n`);
      return true; // Return true in development even if email fails
    }
    
    return false;
  }
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, name?: string): Promise<void> {
  const subject = 'Welcome to Hgraph AI';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Hgraph AI!</h1>
        </div>
        <div class="content">
          <p>Hi${name ? ` ${name}` : ''},</p>
          <p>Your account has been successfully created. You can now use magic link authentication to access Hgraph AI.</p>
          <p>Each time you log in, we'll send you a unique code to your email address.</p>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p>Best regards,<br>The Hgraph AI Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject,
      html,
    });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
}