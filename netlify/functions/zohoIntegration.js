st response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/contacts`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
        },
        params: {
          email: email
        },
        timeout: 15000
      }
    );

    if (response.data.contacts && response.data.contacts.length > 0) {
      const customer = response.data.contacts[0];
      log('info', 'Found existing Zoho customer', { 
        contactId: customer.contact_id,
        contactName: customer.contact_name 
      });
      return {
        contact_id: customer.contact_id,
        contact_name: customer.contact_name,
        email: customer.email
      };
    }
    
    throw new Error('Customer not found');
  } catch (error) {
    log('error', 'Failed to find Zoho customer', error);
    throw new Error(`Customer lookup failed: ${error.message}`);
  }
};

// Create Zoho invoice
const createZohoInvoice = async (accessToken, customerId, invoiceData) => {
  try {
    log('info', 'Creating Zoho invoice', { customerId, currency: invoiceData.currency });
    
    const lineItems = invoiceData.serviceItems.map(item => ({
      name: item.serviceName,
      description: `${item.serviceName} - ${item.packageType} Package (Quantity: ${item.quantity})`,
      rate: item.unitPrice,
      quantity: item.quantity,
      item_total: item.totalPrice
    }));

    const invoicePayload = {
      customer_id: customerId,
      invoice_number: `INV-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      line_items: lineItems,
      notes: invoiceData.notes || 'Thank you for choosing Mechinweb!',
      terms: 'Payment due within 30 days.',
      currency_code: invoiceData.currency,
      is_inclusive_tax: false
    };

    log('info', 'Invoice payload prepared', {
      invoiceNumber: invoicePayload.invoice_number,
      lineItemsCount: lineItems.length,
      currency: invoicePayload.currency_code,
      customerId: customerId
    });

    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrl}/invoices`,
      invoicePayload,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const invoice = response.data.invoice;
    log('info', 'Zoho invoice created successfully', {
      invoiceId: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number,
      total: invoice.total,
      status: invoice.status
    });

    return {
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      payment_url: `https://invoice.zoho.in/invoices/${invoice.invoice_id}/payment`,
      total: invoice.total,
      status: invoice.status,
      customer_id: customerId
    };
  } catch (error) {
    log('error', 'Failed to create Zoho invoice', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(`Invoice creation failed: ${error.response?.data?.message || error.message}`);
  }
};

// Get invoice status
const getZohoInvoiceStatus = async (accessToken, invoiceId) => {
  try {
    log('info', 'Getting Zoho invoice status', { invoiceId });
    
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/invoices/${invoiceId}`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
        },
        timeout: 15000
      }
    );

    const invoice = response.data.invoice;
    log('info', 'Invoice status retrieved', {
      invoiceId,
      status: invoice.status,
      total: invoice.total
    });

    return {
      status: invoice.status,
      total: invoice.total,
      payment_date: invoice.last_payment_date
    };
  } catch (error) {
    log('error', 'Failed to get invoice status', error);
    throw new Error(`Invoice status check failed: ${error.message}`);
  }
};

// Main handler function
exports.handler = async (event, context) => {
  const requestId = context.awsRequestId || Date.now().toString();
  
  log('info', 'Zoho integration function invoked', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    headers: {
      authorization: event.headers.authorization ? 'present' : 'missing',
      contentType: event.headers['content-type']
    }
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Validate Zoho configuration
    validateZohoConfig();

    // Get access token first
    const accessToken = await getZohoAccessToken();
    
    // Test API connection
    await testZohoConnection(accessToken);

    // Parse request body for POST requests
    let requestData = {};
    if (event.httpMethod === 'POST' && event.body) {
      try {
        requestData = JSON.parse(event.body);
        log('info', 'Request data parsed', {
          hasCustomerData: !!requestData.customerData,
          hasServiceItems: !!requestData.serviceItems,
          currency: requestData.currency
        });
      } catch (parseError) {
        log('error', 'Failed to parse request body', parseError);
        throw new Error('Invalid JSON in request body');
      }
    }

    // Handle different request types
    if (event.httpMethod === 'POST') {
      // Handle customer creation and invoice creation in one call
      if (requestData.customerData && requestData.serviceItems) {
        log('info', 'Processing customer creation and invoice generation');
        
        // Create or find customer
        const customer = await createZohoCustomer(accessToken, requestData.customerData);
        
        // Create invoice
        const invoice = await createZohoInvoice(accessToken, customer.contact_id, {
          serviceItems: requestData.serviceItems,
          currency: requestData.currency || 'USD',
          notes: requestData.notes
        });

        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            customer,
            invoice,
            requestId,
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Handle customer creation only
      else if (requestData.name && requestData.email) {
        const customer = await createZohoCustomer(accessToken, requestData);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            customer,
            requestId
          })
        };
      }
      
      else {
        throw new Error('Invalid request data. Expected customerData and serviceItems or customer details.');
      }
    }
    
    // Handle GET requests (status checks, etc.)
    else if (event.httpMethod === 'GET') {
      const url = new URL(`https://example.com${event.path}`);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      
      // Get invoice status
      if (pathSegments.includes('invoices') && pathSegments.length >= 3) {
        const invoiceId = pathSegments[pathSegments.length - 1];
        const status = await getZohoInvoiceStatus(accessToken, invoiceId);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            status,
            requestId
          })
        };
      }
      
      // Test connection
      else {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            message: 'Zoho integration is working correctly',
            timestamp: new Date().toISOString(),
            requestId,
            config: {
              hasClientId: !!ZOHO_CONFIG.clientId,
              hasClientSecret: !!ZOHO_CONFIG.clientSecret,
              hasRefreshToken: !!ZOHO_CONFIG.refreshToken,
              hasOrgId: !!ZOHO_CONFIG.organizationId,
              apiConnectionSuccessful: true
            }
          })
        };
      }
    }

    // Invalid method
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

  } catch (error) {
    log('error', 'Zoho integration function error', {
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
          hasClientId: !!ZOHO_CONFIG.clientId,
          hasClientSecret: !!ZOHO_CONFIG.clientSecret,
          hasRefreshToken: !!ZOHO_CONFIG.refreshToken,
          hasOrgId: !!ZOHO_CONFIG.organizationId
        }
      })
    };
  }
};