// Terminology mapping system for multi-industry platform
// Maps business-specific terms based on tenant business type

export type BusinessType = 
  | 'call_center' 
  | 'billing_service' 
  | 'subscription_provider' 
  | 'freelancer_consultant' 
  | 'property_management'
  | 'nonprofit_organization';

export interface TerminologyMap {
  // Person/Entity terms
  consumer: string;           // The person using the service
  consumerPlural: string;
  creditor: string;           // The entity providing the service
  creditorPlural: string;
  
  // Transaction/Work terms
  account: string;            // A record of work or debt
  accountPlural: string;
  placement: string;          // Initial assignment or work item
  placementPlural: string;
  
  // Financial terms
  balance: string;            // Amount owed or due
  payment: string;            // Money received
  paymentPlural: string;
  settlement: string;         // Reduced payment or completion
  settlementPlural: string;
  
  // Action terms
  collect: string;            // Primary action verb
  collecting: string;
  collection: string;
  
  // Status terms
  delinquent: string;         // Behind on payments/obligations
  current: string;            // Up to date
  paidOff: string;           // Fully completed
  
  // Callback request status terms
  callbackRequest: string;    // Name for the request type
  callbackRequestPlural: string;
  statusCalled: string;       // Successfully contacted
  statusNoAnswer: string;     // No response
  statusScheduled: string;    // Scheduled for future contact
  statusInProgress: string;   // Currently working on it
  statusCompleted: string;    // Request fulfilled
}

const terminologyMaps: Record<BusinessType, TerminologyMap> = {
  // Debt Collection / Call Center - Original terminology
  call_center: {
    consumer: 'Debtor',
    consumerPlural: 'Debtors',
    creditor: 'Creditor',
    creditorPlural: 'Creditors',
    account: 'Account',
    accountPlural: 'Accounts',
    placement: 'Placement',
    placementPlural: 'Placements',
    balance: 'Balance',
    payment: 'Payment',
    paymentPlural: 'Payments',
    settlement: 'Settlement',
    settlementPlural: 'Settlements',
    collect: 'Collect',
    collecting: 'Collecting',
    collection: 'Collection',
    delinquent: 'Delinquent',
    current: 'Current',
    paidOff: 'Paid Off',
    callbackRequest: 'Callback Request',
    callbackRequestPlural: 'Callback Requests',
    statusCalled: 'Called',
    statusNoAnswer: 'No Answer',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
  },
  
  // Billing / Service Company
  billing_service: {
    consumer: 'Customer',
    consumerPlural: 'Customers',
    creditor: 'Service Provider',
    creditorPlural: 'Service Providers',
    account: 'Invoice',
    accountPlural: 'Invoices',
    placement: 'Service Order',
    placementPlural: 'Service Orders',
    balance: 'Amount Due',
    payment: 'Payment',
    paymentPlural: 'Payments',
    settlement: 'Discount Offer',
    settlementPlural: 'Discount Offers',
    collect: 'Bill',
    collecting: 'Billing',
    collection: 'Billing',
    delinquent: 'Overdue',
    current: 'Current',
    paidOff: 'Paid',
    callbackRequest: 'Service Request',
    callbackRequestPlural: 'Service Requests',
    statusCalled: 'Contacted',
    statusNoAnswer: 'No Response',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Resolved',
  },
  
  // Subscription Provider
  subscription_provider: {
    consumer: 'Subscriber',
    consumerPlural: 'Subscribers',
    creditor: 'Provider',
    creditorPlural: 'Providers',
    account: 'Subscription',
    accountPlural: 'Subscriptions',
    placement: 'Plan',
    placementPlural: 'Plans',
    balance: 'Amount Due',
    payment: 'Payment',
    paymentPlural: 'Payments',
    settlement: 'Discount',
    settlementPlural: 'Discounts',
    collect: 'Charge',
    collecting: 'Charging',
    collection: 'Billing',
    delinquent: 'Past Due',
    current: 'Active',
    paidOff: 'Paid',
    callbackRequest: 'Support Request',
    callbackRequestPlural: 'Support Requests',
    statusCalled: 'Contacted',
    statusNoAnswer: 'No Response',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Resolved',
  },
  
  // Freelancer / Consultant
  freelancer_consultant: {
    consumer: 'Client',
    consumerPlural: 'Clients',
    creditor: 'Consultant',
    creditorPlural: 'Consultants',
    account: 'Project',
    accountPlural: 'Projects',
    placement: 'Engagement',
    placementPlural: 'Engagements',
    balance: 'Amount Due',
    payment: 'Payment',
    paymentPlural: 'Payments',
    settlement: 'Adjusted Amount',
    settlementPlural: 'Adjusted Amounts',
    collect: 'Invoice',
    collecting: 'Invoicing',
    collection: 'Invoicing',
    delinquent: 'Overdue',
    current: 'Current',
    paidOff: 'Completed',
    callbackRequest: 'Follow-up Request',
    callbackRequestPlural: 'Follow-up Requests',
    statusCalled: 'Contacted',
    statusNoAnswer: 'No Response',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Resolved',
  },
  
  // Property Management
  property_management: {
    consumer: 'Tenant',
    consumerPlural: 'Tenants',
    creditor: 'Property Owner',
    creditorPlural: 'Property Owners',
    account: 'Lease',
    accountPlural: 'Leases',
    placement: 'Unit',
    placementPlural: 'Units',
    balance: 'Amount Due',
    payment: 'Rent Payment',
    paymentPlural: 'Rent Payments',
    settlement: 'Payment Plan',
    settlementPlural: 'Payment Plans',
    collect: 'Collect Rent',
    collecting: 'Collecting Rent',
    collection: 'Rent Collection',
    delinquent: 'Late',
    current: 'Current',
    paidOff: 'Paid',
    callbackRequest: 'Maintenance Request',
    callbackRequestPlural: 'Maintenance Requests',
    statusCalled: 'Contacted',
    statusNoAnswer: 'No Response',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Resolved',
  },
  
  // Non-Profit Organization
  nonprofit_organization: {
    consumer: 'Donor',
    consumerPlural: 'Donors',
    creditor: 'Organization',
    creditorPlural: 'Organizations',
    account: 'Giving Record',
    accountPlural: 'Giving Records',
    placement: 'Campaign',
    placementPlural: 'Campaigns',
    balance: 'Pledge Amount',
    payment: 'Donation',
    paymentPlural: 'Donations',
    settlement: 'Final Contribution',
    settlementPlural: 'Final Contributions',
    collect: 'Solicit',
    collecting: 'Fundraising',
    collection: 'Fundraising',
    delinquent: 'Pledge Pending',
    current: 'Active Donor',
    paidOff: 'Fulfilled',
    callbackRequest: 'Contact Request',
    callbackRequestPlural: 'Contact Requests',
    statusCalled: 'Contacted',
    statusNoAnswer: 'No Response',
    statusScheduled: 'Scheduled',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
  },
};

/**
 * Get terminology mapping for a specific business type
 */
export function getTerminology(businessType: BusinessType = 'call_center'): TerminologyMap {
  return terminologyMaps[businessType] || terminologyMaps.call_center;
}

/**
 * Get a specific term for a business type
 */
export function getTerm(businessType: BusinessType = 'call_center', key: keyof TerminologyMap): string {
  const map = getTerminology(businessType);
  return map[key];
}

/**
 * Get business type display name
 */
export function getBusinessTypeName(businessType: BusinessType): string {
  const names: Record<BusinessType, string> = {
    call_center: 'Debt Collection / Call Center',
    billing_service: 'Billing / Service Company',
    subscription_provider: 'Subscription Provider',
    freelancer_consultant: 'Freelancer / Consultant',
    property_management: 'Property Management',
    nonprofit_organization: 'Non-Profit Organization',
  };
  return names[businessType] || 'Debt Collection / Call Center';
}

/**
 * Get all available business types
 */
export function getBusinessTypes(): { value: BusinessType; label: string }[] {
  return [
    { value: 'call_center', label: 'Debt Collection / Call Center' },
    { value: 'billing_service', label: 'Billing / Service Company' },
    { value: 'subscription_provider', label: 'Subscription Provider' },
    { value: 'freelancer_consultant', label: 'Freelancer / Consultant' },
    { value: 'property_management', label: 'Property Management' },
    { value: 'nonprofit_organization', label: 'Non-Profit Organization' },
  ];
}
