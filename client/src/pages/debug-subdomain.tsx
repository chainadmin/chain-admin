import { useEffect, useState } from "react";
import { getAgencySlugFromRequest, extractSubdomain, isSubdomainSupported } from "@shared/utils/subdomain";

export default function DebugSubdomain() {
  const [debugInfo, setDebugInfo] = useState<any>({});
  
  useEffect(() => {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const origin = window.location.origin;
    
    const subdomain = extractSubdomain(hostname);
    const agencySlug = getAgencySlugFromRequest(hostname, pathname);
    const subdomainSupported = isSubdomainSupported();
    
    setDebugInfo({
      hostname,
      pathname,
      origin,
      subdomain,
      agencySlug,
      subdomainSupported,
      hostnameParts: hostname.split('.'),
      isLocalhost: hostname.includes('localhost'),
      isReplit: hostname.includes('.repl'),
    });
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Subdomain Debug Information</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
        
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Summary</h2>
          <ul className="space-y-2">
            <li><strong>Current URL:</strong> {debugInfo.origin}</li>
            <li><strong>Detected Subdomain:</strong> {debugInfo.subdomain || 'None'}</li>
            <li><strong>Agency Slug:</strong> {debugInfo.agencySlug || 'None'}</li>
            <li><strong>Subdomain Support:</strong> {debugInfo.subdomainSupported ? 'Yes' : 'No'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}