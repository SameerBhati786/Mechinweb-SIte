const nodemailer = require('nodemailer');

// Enhanced logging function
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  };
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
  return logEntry;
};

// Email Configuration with enhanced error handling
const createEmailTransporter = () => {
  log('info', 'Creating email transporter');
  
  const config = {
    host: 'smtp.zoho.in',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    },
    debug: false, // Disable debug to reduce logs
    logger: false // Disable logger to reduce logs
  };

  log('info', 'Email config', {
    host: config.host,
    port: config.port,
    user: config.auth.user,
    hasPassword: !!config.auth.pass
  });

  return nodemailer.createTransport(config);
};

// Verify email configuration
const verifyEmailConfig = async (transporter) => {
  try {
    log('info', 'Verifying email configuration...');
    await transporter.verify();
    log('info', 'Email configuration verified successfully');
    return true;
  } catch (error) {
    log('error', 'Email configuration verification failed', error);
    throw new Error(`Email configuration invalid: ${error.message}`);
  }
};

// Enhanced email sending with retry logic
const sendEmailWithRetry = async (transporter, emailOptions, maxRetries = 2) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log('info', `Sending email attempt ${attempt}/${maxRetries}`, {
        to: emailOptions.to,
        subject: emailOptions.subject
      });
      
      const result = await transporter.sendMail(emailOptions);
      log('info', 'Email sent successfully', {
        messageId: result.messageId,
        response: result.response
      });
      return result;
    } catch (error) {
      log('error', `Email send attempt ${attempt} failed`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
};

// Main handler function
exports.handler = async (event, context) => {
  const requestId = context.awsRequestId || Date.now().toString();
  
  log('info', 'Function invoked', {
    requestId,
    method: event.httpMethod,
    path: event.path
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    log('info', 'Handling CORS preflight');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    log('error', 'Invalid HTTP method', { method: event.httpMethod });
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: false, 
        error: 'Method not allowed',
        requestId 
      })
    };
  }

  try {
    // Parse request body
    let requestData;
    try {
      requestData = JSON.parse(event.body || '{}');
      log('info', 'Request data parsed', { type: requestData.type });
    } catch (parseError) {
      log('error', 'Failed to parse request body', parseError);
      throw new Error('Invalid JSON in request body');
    }

    const { type, data } = requestData;

    // Validate email credentials
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      log('error', 'Email credentials missing', {
        hasEmailUser: !!process.env.EMAIL_USER,
        hasEmailPassword: !!process.env.EMAIL_PASSWORD
      });
      throw new Error('Email credentials not configured. Please set EMAIL_USER and EMAIL_PASSWORD in Netlify environment variables.');
    }

    // Create and verify email transporter
    const transporter = createEmailTransporter();
    await verifyEmailConfig(transporter);

    // Route to appropriate handler
    switch (type) {
      case 'contact_form':
        await handleContactForm(transporter, data, requestId);
        break;
      case 'quote_request':
        await handleQuoteRequest(transporter, data, requestId);
        break;
      case 'welcome_email':
        await handleWelcomeEmail(transporter, data, requestId);
        break;
      case 'payment_confirmation':
        await handlePaymentConfirmation(transporter, data, requestId);
        break;
      default:
        throw new Error(`Invalid email type: ${type}`);
    }

    log('info', 'Email function completed successfully', { requestId });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        requestId,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    log('error', 'Email function error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        requestId,
        timestamp: new Date().toISOString(),
        debug: {
          hasEmailUser: !!process.env.EMAIL_USER,
          hasEmailPassword: !!process.env.EMAIL_PASSWORD,
          emailUser: process.env.EMAIL_USER,
          nodeVersion: process.version
        }
      })
    };
  }
};

// Handle contact form submissions
async function handleContactForm(transporter, data, requestId) {
  log('info', 'Processing contact form', { requestId, email: data.email });
  
  const { name, email, subject, message } = data;

  // Validate required fields
  if (!name || !email || !subject || !message) {
    throw new Error('Missing required fields: name, email, subject, message');
  }

  // Email to customer (confirmation)
  const customerEmailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Message Received - Mechinweb IT Services',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Thank You for Contacting Us!</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Dear ${name},</p>
          
          <p>Thank you for reaching out to Mechinweb. We've received your message and will get back to you within 24 hours.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #3B82F6; margin-top: 0;">Your Message:</h3>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p style="background: #f8f9fa; padding: 15px; border-radius: 4px;">${message}</p>
          </div>
          
          <p>For urgent matters, feel free to contact us directly:</p>
          <p>📧 Email: contact@mechinweb.com</p>
          
          <p>Best regards,<br>
          The Mechinweb Team</p>
        </div>
      </div>
    `
  };

  // Email to business
  const businessEmailOptions = {
    from: process.env.EMAIL_USER,
    to: 'contact@mechinweb.com',
    subject: `New Contact Message - ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">New Contact Message Received</h2>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h3>Contact Information:</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          
          <h3>Message:</h3>
          <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #3B82F6;">
            ${message}
          </div>
          
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Request ID:</strong> ${requestId}</p>
        </div>
        
        <p><em>Please respond to the customer within 24 hours.</em></p>
      </div>
    `
  };

  // Send both emails
  await Promise.all([
    sendEmailWithRetry(transporter, customerEmailOptions),
    sendEmailWithRetry(transporter, businessEmailOptions)
  ]);

  log('info', 'Contact form emails sent successfully', { requestId });
}

// Handle quote requests
async function handleQuoteRequest(transporter, data, requestId) {
  log('info', 'Processing quote request', { requestId, email: data.customer_email });
  
  const { customer_name, customer_email, service_type, budget_range, timeline, project_details, company_name, phone } = data;

  // Email to customer
  const customerEmailOptions = {
    from: process.env.EMAIL_USER,
    to: customer_email,
    subject: 'Quote Request Received - Mechinweb IT Services',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Thank You for Your Quote Request!</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Dear ${customer_name},</p>
          
          <p>Thank you for requesting a quote for our IT services. We've received your request and will review it carefully.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #3B82F6; margin-top: 0;">Quote Details:</h3>
            <p><strong>Service:</strong> ${service_type}</p>
            <p><strong>Budget Range:</strong> ${budget_range}</p>
            <p><strong>Timeline:</strong> ${timeline}</p>
            <p><strong>Request ID:</strong> ${requestId}</p>
          </div>
          
          <p><strong>What happens next?</strong></p>
          <ol>
            <li>We'll review your requirements within 24 hours</li>
            <li>Prepare a detailed quote with pricing</li>
            <li>Send you the official estimate via email</li>
            <li>Schedule a call to discuss the project</li>
          </ol>
          
          <p>For urgent matters, feel free to contact us directly:</p>
          <p>📧 Email: contact@mechinweb.com</p>
          
          <p>Best regards,<br>
          The Mechinweb Team</p>
        </div>
      </div>
    `
  };

  // Email to business
  const businessEmailOptions = {
    from: process.env.EMAIL_USER,
    to: 'contact@mechinweb.com',
    subject: `New Quote Request - ${customer_name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">New Quote Request Received</h2>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h3>Customer Information:</h3>
          <p><strong>Name:</strong> ${customer_name}</p>
          <p><strong>Email:</strong> ${customer_email}</p>
          <p><strong>Company:</strong> ${company_name || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          
          <h3>Project Details:</h3>
          <p><strong>Service:</strong> ${service_type}</p>
          <p><strong>Budget Range:</strong> ${budget_range}</p>
          <p><strong>Timeline:</strong> ${timeline}</p>
          
          <h3>Project Description:</h3>
          <p>${project_details}</p>
          
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Request ID:</strong> ${requestId}</p>
        </div>
        
        <p><em>Please review and prepare the quote.</em></p>
      </div>
    `
  };

  await Promise.all([
    sendEmailWithRetry(transporter, customerEmailOptions),
    sendEmailWithRetry(transporter, businessEmailOptions)
  ]);

  log('info', 'Quote request emails sent successfully', { requestId });
}

// Handle welcome emails
async function handleWelcomeEmail(transporter, data, requestId) {
  log('info', 'Processing welcome email', { requestId, email: data.clientEmail });
  
  const { clientName, clientEmail, loginUrl } = data;

  const emailOptions = {
    from: process.env.EMAIL_USER,
    to: clientEmail,
    subject: 'Welcome to Mechinweb - Your Account is Ready!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to Mechinweb!</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Dear ${clientName},</p>
          
          <p>Welcome to Mechinweb! Your client account has been successfully created and you can now access our full range of IT services.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #3B82F6; margin-top: 0;">Your Account Details:</h3>
            <p><strong>Name:</strong> ${clientName}</p>
            <p><strong>Email:</strong> ${clientEmail}</p>
            <p><strong>Account Status:</strong> Active</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background: linear-gradient(135deg, #3B82F6, #1E40AF); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Access Your Dashboard
            </a>
          </div>
          
          <p>Best regards,<br>
          The Mechinweb Team</p>
        </div>
      </div>
    `
  };

  await sendEmailWithRetry(transporter, emailOptions);
  log('info', 'Welcome email sent successfully', { requestId });
}

// Handle payment confirmation emails
async function handlePaymentConfirmation(transporter, data, requestId) {
  log('info', 'Processing payment confirmation email', { requestId, email: data.clientEmail });
  
  const { clientName, clientEmail, serviceName, packageType, orderId, amount } = data;

  const emailOptions = {
    from: process.env.EMAIL_USER,
    to: clientEmail,
    subject: 'Payment Confirmation - Mechinweb IT Services',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10B981, #059669); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Payment Confirmed!</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Dear ${clientName},</p>
          
          <p>Thank you for your payment! We've received your payment and will begin working on your service immediately.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #10B981; margin-top: 0;">Order Details:</h3>
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Package:</strong> ${packageType}</p>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Amount:</strong> $${amount}</p>
            <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Request ID:</strong> ${requestId}</p>
          </div>
          
          <div style="background: #e0f2fe; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0277bd; margin-top: 0;">What happens next?</h3>
            <ol>
              <li>Our team will contact you within 24 hours</li>
              <li>We'll begin working on your service</li>
              <li>You'll receive regular updates on progress</li>
              <li>Service completion notification</li>
            </ol>
          </div>
          
          <p>You can track your order progress in your dashboard.</p>
          
          <p>Best regards,<br>
          The Mechinweb Team</p>
        </div>
      </div>
    `
  };

  await sendEmailWithRetry(transporter, emailOptions);
  log('info', 'Payment confirmation email sent successfully', { requestId });
}