import nodemailer from 'nodemailer';

// Create transporter using Postfix
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
});

// Email options
const mailOptions = {
  from: 'noreply@hgraph.ai',
  to: 'tyler@hgraph.io',
  subject: 'Test Email from Hgraph MCP Server',
  text: 'This is a test email sent via Postfix.\n\nIf you receive this, the email configuration is working!',
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Test Email from Hgraph MCP Server</h2>
      <p>This is a test email sent via Postfix.</p>
      <p>If you receive this, the email configuration is working!</p>
      <hr>
      <p style="color: #666; font-size: 12px;">Sent from your local MCP server</p>
    </div>
  `
};

// Send email
console.log('Attempting to send email to tyler@hgraph.io...');
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('Failed to send email:', error);
  } else {
    console.log('Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  }
});