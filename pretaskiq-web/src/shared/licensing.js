// What each license tier includes. THE TIER CONTENTS BELOW ARE PLACEHOLDERS: edit this one file to change what Basic, Standard and Full include.
// The server checks these on every request (a company that is not licensed for a feature gets a 403), and the app hides what a company does not have.
export const FEATURES = {
  planning:           'Pre-task planning with Petey and the plan document',
  knowledge_base:     'Company knowledge base',
  incidents:          'Incident reporting',
  protection:         'Protection observations',
  audits:             'Safety audits',
  rca:                'Root cause analysis assistant and reenactments',
  construction_admin: 'Construction Admin: project overview',
  metrics:            'Safety metrics: leading indicators, TRIR and DART, by month and by job',
  jobs:               'Jobs: job folders with scope documents, RFIs, revisions, permits and 811 tickets',
};

export const TIERS = {
  basic:    { label: 'Basic',    features: ['planning', 'knowledge_base'] },
  standard: { label: 'Standard', features: ['planning', 'knowledge_base', 'incidents', 'protection', 'audits', 'jobs', 'metrics'] },
  full:     { label: 'Full',     features: ['planning', 'knowledge_base', 'incidents', 'protection', 'audits', 'rca', 'construction_admin', 'jobs', 'metrics'] },
};

export const COMPANY_STATUSES = ['active', 'suspended'];
export const isTier = (t) => Object.prototype.hasOwnProperty.call(TIERS, t);
export const featuresFor = (tier) => (isTier(tier) ? [...TIERS[tier].features] : []);
