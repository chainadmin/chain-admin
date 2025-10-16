// Quick SMAX connection test
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testSmaxLogin() {
  const config = {
    apiKey: 'W4teqfYX7fbEnRMAduCO',
    pin: 'WayPoint',
    baseUrl: 'https://apiv2.smaxcollectionsoftware.com'
  };

  console.log('🔗 Testing SMAX login to:', config.baseUrl);
  console.log('📝 Using API Key:', config.apiKey);
  console.log('📝 Using PIN:', config.pin);

  try {
    const response = await fetch(`${config.baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apikey: config.apiKey,
        pin: config.pin,
      }),
    });

    console.log('\n📊 Response Status:', response.status);
    console.log('📊 Response OK:', response.ok);

    const data = await response.json();
    console.log('\n📄 Response Data:', JSON.stringify(data, null, 2));

    if (data.state === 'SUCCESS' && data.result?.access_token) {
      console.log('\n✅ SUCCESS! Bearer token obtained:', data.result.access_token.substring(0, 20) + '...');
      return true;
    } else {
      console.log('\n❌ FAILED: No access token in response');
      return false;
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    return false;
  }
}

testSmaxLogin();
