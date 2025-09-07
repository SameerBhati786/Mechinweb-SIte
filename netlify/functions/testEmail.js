// Test function to verify email configuration
const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
  console.log('Test email function invoked');
  
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Check environment variables
    const envCheck = {
      EMAIL_USER: !!process.env.EMAIL_USER,
      EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
      EMAIL_USER_VALUE: process.env.EMAIL_USER,
      NODE_ENV: process.env.NODE_ENV,
      NETLIFY: !!process.env.NETLIFY,
      URL: process.env.URL
    };

    console.log('Environment check:', envCheck);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Email credentials not configured',
          debug: envCheck
        })
      };
    }

    // Test email configuration
    const transporter = nodemailer.createTransporter({
      host: 'smtp.zoho.in',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection
    await transporter.verify();
    console.log('Email configuration verified successfully');

    // Send test email if requested
    if (event.httpMethod === 'POST') {
      const testEmail = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Send to self for testing
        subject: 'Netlify Email Test - Mechinweb',
        html: `
          <h2>Email Test Successful!</h2>
          <p>This test email was sent from Netlify Functions at ${new Date().toISOString()}</p>
          <p>Email configuration is working correctly.</p>
        `
      };

      await transporter.sendMail(testEmail);
      console.log('Test email sent successfully');
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Email configuration is working',
        timestamp: new Date().toISOString(),
        debug: envCheck
      })
    };

  } catch (error) {
    console.error('Email test failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        debug: {
          EMAIL_USER: !!process.env.EMAIL_USER,
          EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
          EMAIL_USER_VALUE: process.env.EMAIL_USER
        }
      })
    };
  }
};