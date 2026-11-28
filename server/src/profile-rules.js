export const ROLE_TABLES = Object.freeze({
  customer: 'customer_profiles',
  professional: 'professional_profiles',
  business: 'business_profiles',
  hiring: 'hiring_profiles',
});

const REQUIRED_FIELDS = {
  customer: [
    'fullName',
    'email',
    'country',
    'state',
    'city',
    'area',
    'pinCode',
  ],
  professional: [
    'fullName',
    'email',
    'headline',
    'primaryCategory',
    'subCategory',
    'bio',
    'experienceYears',
    'skills',
    'qualifications',
    'services',
    'pricingType',
    'country',
    'state',
    'city',
    'serviceAreas',
    'workingRadius',
    'availableDays',
    'workingHours',
  ],
  business: [
    'companyName',
    'businessType',
    'businessCategory',
    'shortDescription',
    'contactEmail',
    'contactName',
    'contactDesignation',
    'businessPhone',
    'country',
    'state',
    'city',
    'businessAddress',
    'pinCode',
    'services',
    'workingHours',
  ],
  hiring: ['hiringAs', 'hiringCategories', 'hiringPurpose', 'hiringLocations'],
};

function hasValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function requiredForRole(role, profile) {
  if (role !== 'hiring') {
    return REQUIRED_FIELDS[role];
  }
  if (profile.hiringAs === 'organization') {
    return [
      'hiringAs',
      'companyName',
      'agencyType',
      'contactName',
      'designation',
      'businessEmail',
      'businessPhone',
      'industry',
      'companyDescription',
      'yearsInBusiness',
      'projectsCompleted',
      'country',
      'state',
      'city',
      'hiringCategories',
      'hiringPurpose',
      'hiringLocations',
    ];
  }
  return [
    'hiringAs',
    'fullName',
    'email',
    'country',
    'state',
    'city',
    'hiringCategories',
    'hiringPurpose',
    'hiringLocations',
  ];
}

export function getMissingProfileFields(role, profile) {
  if (!Object.prototype.hasOwnProperty.call(ROLE_TABLES, role)) {
    throw new Error('Unsupported profile role.');
  }
  return requiredForRole(role, profile).filter((field) => !hasValue(profile[field]));
}

export function getProfileCompletion(role, profile) {
  const required = requiredForRole(role, profile);
  const requiredDone = required.filter((field) => hasValue(profile[field])).length;
  const percentage = required.length === 0
    ? 0
    : Math.floor((requiredDone / required.length) * 100);
  const missing = getMissingProfileFields(role, profile);
  return {
    missing,
    percentage,
    complete: missing.length === 0,
  };
}
