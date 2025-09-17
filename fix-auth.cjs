const fs = require('fs');

// Read the file
let content = fs.readFileSync('server/routes.ts', 'utf8');

// Pattern 1: Fix the messed up auth pattern
content = content.replace(/const tenantId = req\.user\.tenantId;\s*if \(!tenantId\) \{ return res\.status\(403\)\.json\(\{ message: "No tenant access" \}\); \}\s*\/\/ Authorization check passed \{\s*return res\.status\(403\)\.json\(\{ message: "No tenant access" \}\);\s*\}/g, 
  `const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }`);

// Pattern 2: Replace platformUser.tenantId with tenantId
content = content.replace(/platformUser\.tenantId/g, 'tenantId');

// Pattern 3: Remove any remaining platformUser references that are not needed
content = content.replace(/\s*const platformUser = .*?;\s*/g, '');

// Pattern 4: Fix the isPlatformAdmin middleware
content = content.replace(/const isPlatformAdmin = async \(req: any, res: any, next: any\) => \{\s*const tenantId = req\.user\.tenantId;/g, 
  `const isPlatformAdmin = async (req: any, res: any, next: any) => {
    const userId = req.user?.userId;`);

// Pattern 5: Fix getTenantId function
content = content.replace(/async function getTenantId\(req: any, storage: IStorage\): Promise<string \| null> \{\s*if \(req\.user\?\.claims\?\.sub\) \{\s*const platformUser = await storage\.getPlatformUser\(req\.user\.claims\.sub\);\s*return platformUser\?\.tenantId \|\| null;/g,
  `async function getTenantId(req: any, storage: IStorage): Promise<string | null> {
  if (req.user?.tenantId) {
    return req.user.tenantId;`);

// Pattern 6: Fix any remaining references to req.user.claims.sub for agency registration
content = content.replace(/const tenantId = req\.user\.tenantId;\s*const \{ name, slug \} = req\.body/g,
  `const userId = req.user?.userId;
      const { name, slug } = req.body`);

// Write the fixed content back
fs.writeFileSync('server/routes.ts', content);

console.log('Auth fixes applied successfully');