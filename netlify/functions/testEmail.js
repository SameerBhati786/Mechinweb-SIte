const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
  // Log the nodemailer object to see what is actually being imported.
  console.log('Nodemailer object:', nodemailer);

  // Check that environment variables are loaded
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.error('Email credentials are not set in environment variables.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Email credentials not configured.' }),
    };
  }

  try {
    // 1. Attempt to create the transporter
    const transporter = nodemailer.createTransporter({
      host: 'smtp.zoho.in',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    console.log('Transporter created successfully.');

    // 2. Verify the SMTP connection
    await transporter.verify();

    console.log('SMTP configuration is correct.');

    // 3. If everything works, return a success message
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Nodemailer is configured correctly!' }),
    };

  } catch (error) {
    console.error('Test failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Test failed.',
        errorMessage: error.message
      }),
    };
  }
};