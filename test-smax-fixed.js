// Test updated SMAX authentication flow
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testSmaxAuth() {
  const config = {
    apiKey: 'W4teqfYX7fbEnRMAduCO',
    pin: 'WayPoint',
    baseUrl: 'https://apiv2.smaxcollectionsoftware.com'
  };

  console.log('🔗 Testing SMAX authentication...\n');

  // Step 1: Login
  const loginResponse = await fetch(`${config.baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: config.apiKey,
      pin: config.pin,
    }),
  });

  const loginData = await loginResponse.json();
  console.log('✅ Login Response:', JSON.stringify(loginData, null, 2));

  if (!loginData.access_token) {
    console.log('❌ No access token received!');
    return;
  }

  const token = loginData.access_token;
  console.log('\n✅ Bearer Token obtained:', token.substring(0, 30) + '...');

  // Step 2: Test using the bearer token
  console.log('\n🔑 Testing API call with bearer token...');
  
  try {
    const testResponse = await fetch(`${config.baseUrl}/accounts`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('📊 API Response Status:', testResponse.status);
    
    if (testResponse.ok) {
      console.log('✅ Bearer token authentication SUCCESSFUL!');
    } else {
      const errorData = await testResponse.text();
      console.log('⚠️  Response:', errorData);
    }
  } catch (error) {
    console.log('❌ API call error:', error.message);
  }
}

testSmaxAuth();
