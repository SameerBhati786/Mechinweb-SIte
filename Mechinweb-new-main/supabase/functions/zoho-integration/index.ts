import { corsHeaders } from '../_shared/cors.ts';

interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ZohoCustomerRequest {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

interface ZohoInvoiceRequest {
  customerId: string;
  serviceId: string;
  packageType: string;
  amount: number;
  currency: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Get Zoho access token
    if (path.includes('/token')) {
      const tokenResponse = await getZohoAccessToken();
      return new Response(JSON.stringify(tokenResponse), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Create Zoho customer
    if (path.includes('/customers') && req.method === 'POST') {
      const customerData: ZohoCustomerRequest = await req.json();
      const customer = await createZohoCustomer(customerData);
      return new Response(JSON.stringify(customer), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Create Zoho invoice
    if (path.includes('/invoices') && req.method === 'POST') {
      const invoiceData: ZohoInvoiceRequest = await req.json();
      const invoice = await createZohoInvoice(invoiceData);
      return new Response(JSON.stringify(invoice), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Zoho integration error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});

async function getZohoAccessToken(): Promise<ZohoTokenResponse> {
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN') || '',
      client_id: Deno.env.get('ZOHO_CLIENT_ID') || '',
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET') || '',
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to get Zoho access token');
  }

  return await response.json();
}

async function createZohoCustomer(customerData: ZohoCustomerRequest): Promise<any> {
  const tokenResponse = await getZohoAccessToken();
  
  const response = await fetch('https://invoice.zoho.com/api/v3/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': Deno.env.get('ZOHO_ORGANIZATION_ID') || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contact_name: customerData.name,
      company_name: customerData.company || '',
      email: customerData.email,
      phone: customerData.phone || ''
    })
  });

  if (!response.ok) {
    // If customer already exists, try to find them
    return await findZohoCustomer(customerData.email);
  }

  const data = await response.json();
  return data.contact;
}

async function findZohoCustomer(email: string): Promise<any> {
  const tokenResponse = await getZohoAccessToken();
  
  const response = await fetch(`https://invoice.zoho.com/api/v3/contacts?email=${email}`, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': Deno.env.get('ZOHO_ORGANIZATION_ID') || ''
    }
  });

  if (!response.ok) {
    throw new Error('Customer not found');
  }

  const data = await response.json();
  return data.contacts[0];
}

async function createZohoInvoice(invoiceData: ZohoInvoiceRequest): Promise<any> {
  const tokenResponse = await getZohoAccessToken();
  
  const serviceNames = {
    'email-migration': 'Email Migration & Setup',
    'email-security': 'Domain & Email Security',
    'ssl-setup': 'SSL & HTTPS Setup',
    'cloud-management': 'Cloud Suite Management',
    'data-migration': 'Cloud Data Migration',
    'hosting-support': 'Hosting & Control Panel Support',
    'acronis-setup': 'Acronis Account Setup'
  };

  const serviceName = serviceNames[invoiceData.serviceId as keyof typeof serviceNames] || 'IT Service';
  
  const response = await fetch('https://invoice.zoho.com/api/v3/invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': Deno.env.get('ZOHO_ORGANIZATION_ID') || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer_id: invoiceData.customerId,
      invoice_number: `INV-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      line_items: [{
        name: serviceName,
        description: `${serviceName} - ${invoiceData.packageType} Package`,
        rate: invoiceData.amount,
        quantity: 1
      }],
      notes: `Service: ${serviceName}\nPackage: ${invoiceData.packageType}\nCurrency: ${invoiceData.currency}`,
      terms: 'Payment due within 30 days. Thank you for choosing Mechinweb!'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to create Zoho invoice');
  }

  const data = await response.json();
  return data.invoice;
}