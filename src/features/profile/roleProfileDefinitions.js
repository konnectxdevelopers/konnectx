import { locationOptions, serviceCategories, skillOptions } from './profileData';

const cityOptions = locationOptions.map((location) => location.label);
const serviceOptions = serviceCategories.map((category) => category.label);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const field = (key, label, type = 'text', options = {}) => ({
  key,
  label,
  type,
  ...options,
});

export const roleProfileDefinitions = {
  customer: [
    {
      key: 'personal',
      title: 'Personal information',
      fields: [
        field('fullName', 'Full name', 'text', { required: true }),
        field('email', 'Email address', 'email', { required: true }),
        field('profilePhoto', 'Profile photo (optional)', 'photo'),
      ],
    },
    {
      key: 'location',
      title: 'Location and preferences',
      fields: [
        field('country', 'Country', 'text', { required: true }),
        field('state', 'State', 'text', { required: true }),
        field('city', 'City', 'select', { required: true, options: cityOptions }),
        field('area', 'Area / locality', 'text', { required: true }),
        field('pinCode', 'PIN code', 'text', { required: true, keyboardType: 'numeric' }),
        field('fullAddress', 'Full address', 'textarea'),
        field('preferredLanguage', 'Preferred language', 'select', {
          options: ['English', 'Telugu', 'Hindi'],
        }),
      ],
    },
    { key: 'review', title: 'Review and complete', fields: [] },
  ],
  professional: [
    {
      key: 'personal',
      title: 'Personal information',
      fields: [
        field('fullName', 'Full name', 'text', { required: true }),
        field('email', 'Email address', 'email', { required: true }),
        field('profilePhoto', 'Profile photo', 'photo'),
        field('dateOfBirth', 'Date of birth', 'text', { placeholder: 'YYYY-MM-DD' }),
        field('gender', 'Gender', 'select', {
          options: ['Woman', 'Man', 'Non-binary', 'Prefer not to say'],
        }),
      ],
    },
    {
      key: 'professional',
      title: 'Profession and services',
      fields: [
        field('headline', 'Professional headline / job title', 'text', { required: true }),
        field('primaryCategory', 'Primary service category', 'select', {
          required: true,
          options: serviceOptions,
        }),
        field('subCategory', 'Subcategory', 'text', { required: true }),
        field('bio', 'Professional bio', 'textarea', { required: true }),
        field('services', 'Services offered', 'textarea', { required: true }),
        field('serviceDescriptions', 'Service descriptions', 'textarea'),
      ],
    },
    {
      key: 'experience',
      title: 'Experience and qualifications',
      fields: [
        field('experienceYears', 'Years of experience', 'number', { required: true }),
        field('skills', 'Skills and expertise', 'multi', {
          required: true,
          options: skillOptions,
        }),
        field('qualifications', 'Qualifications', 'textarea', { required: true }),
        field('certifications', 'Certifications (optional)', 'textarea'),
      ],
    },
    {
      key: 'charges',
      title: 'Charges',
      fields: [
        field('pricingType', 'Pricing type', 'select', {
          required: true,
          options: ['Fixed', 'Hourly', 'Negotiable'],
        }),
        field('startingPrice', 'Starting price (optional)', 'number'),
        field('currency', 'Currency', 'select', { options: ['INR', 'USD', 'EUR', 'GBP'] }),
        field('deliveryMethod', 'Service delivery method', 'select', {
          options: ['On-site', 'Remote', 'Hybrid'],
        }),
      ],
    },
    {
      key: 'location',
      title: 'Location and availability',
      fields: [
        field('country', 'Country', 'text', { required: true }),
        field('state', 'State', 'text', { required: true }),
        field('city', 'City', 'select', { required: true, options: cityOptions }),
        field('area', 'Area', 'text'),
        field('fullAddress', 'Full address', 'textarea'),
        field('serviceAreas', 'Service areas', 'multi', {
          required: true,
          options: cityOptions,
        }),
        field('workingRadius', 'Working radius (km)', 'number', { required: true }),
        field('availableDays', 'Available days', 'multi', { required: true, options: weekdays }),
        field('workingHours', 'Working hours', 'text', {
          required: true,
          placeholder: 'e.g. 9:00 AM – 6:00 PM',
        }),
      ],
    },
    {
      key: 'portfolio',
      title: 'Portfolio',
      fields: [
        field('portfolioDescription', 'Portfolio description', 'textarea'),
        field('workSamples', 'Work sample links', 'textarea'),
        field('projectImage', 'Project image (optional)', 'photo'),
        field('portfolioVideo', 'Portfolio video (MP4, optional)', 'file', {
          accept: 'video/mp4',
          uploadLabel: 'Choose MP4 video',
        }),
        field('certificateFile', 'Certificate upload (PDF, optional)', 'file', {
          accept: 'application/pdf',
          uploadLabel: 'Choose certificate PDF',
        }),
      ],
    },
  ],
  business: [
    {
      key: 'identity',
      title: 'Business identity',
      fields: [
        field('companyName', 'Business / company name', 'text', { required: true }),
        field('businessLogo', 'Business logo', 'photo'),
        field('coverImage', 'Cover image (optional)', 'photo'),
        field('businessType', 'Business type', 'select', {
          required: true,
          options: ['Sole proprietor', 'Partnership', 'Private company', 'Nonprofit', 'Other'],
        }),
        field('businessCategory', 'Business category', 'select', {
          required: true,
          options: serviceOptions,
        }),
        field('businessSubcategory', 'Business subcategory', 'text'),
        field('shortDescription', 'Short description', 'textarea', { required: true }),
        field('detailedDescription', 'Detailed description', 'textarea'),
      ],
    },
    {
      key: 'contact',
      title: 'Contact information',
      fields: [
        field('contactEmail', 'Business email', 'email', { required: true }),
        field('businessPhone', 'Business phone', 'phone', { required: true }),
        field('website', 'Website (optional)', 'url'),
        field('contactName', 'Contact person name', 'text', { required: true }),
        field('contactDesignation', 'Contact person designation', 'text', { required: true }),
      ],
    },
    {
      key: 'details',
      title: 'Business details and services',
      fields: [
        field('yearEstablished', 'Year established (optional)', 'number'),
        field('employeeCount', 'Number of employees (optional)', 'number'),
        field('services', 'Services offered', 'textarea', { required: true }),
        field('products', 'Products offered (if applicable)', 'textarea'),
        field('serviceAreas', 'Service areas', 'multi', { options: cityOptions }),
        field('hiringEnabled', 'Business hiring capability (allow job posts)', 'select', {
          options: [
            { label: 'Disabled', value: false },
            { label: 'Enabled', value: true },
          ],
        }),
      ],
    },
    {
      key: 'location',
      title: 'Location and working hours',
      fields: [
        field('country', 'Country', 'text', { required: true }),
        field('state', 'State', 'text', { required: true }),
        field('city', 'City', 'select', { required: true, options: cityOptions }),
        field('businessAddress', 'Full business address', 'textarea', { required: true }),
        field('pinCode', 'PIN code', 'text', { required: true, keyboardType: 'numeric' }),
        field('workingHours', 'Working hours', 'text', { required: true }),
      ],
    },
    {
      key: 'verification',
      title: 'Verification and review',
      fields: [
        field('registrationNumber', 'Registration number (optional)', 'text'),
        field('gstNumber', 'GST number (optional)', 'text'),
        field('panNumber', 'PAN (optional)', 'text'),
        field('verificationDocument', 'Verification document (PDF, optional)', 'file', {
          accept: 'application/pdf',
          uploadLabel: 'Choose verification PDF',
        }),
      ],
    },
  ],
  hiring: [
    {
      key: 'hiringAs',
      title: 'Who are you hiring as?',
      fields: [
        field('hiringAs', 'Choose one', 'select', {
          required: true,
          options: [
            { label: 'Individual', value: 'individual' },
            { label: 'Agency / Company', value: 'organization' },
          ],
        }),
      ],
    },
    {
      key: 'identity',
      title: 'Agency details',
      fields: [],
    },
    {
      key: 'agencyServices',
      title: 'Services',
      fields: [
        field('hiringCategories', 'Preferred hiring categories', 'multi', {
          required: true,
          options: serviceOptions,
        }),
        field('hiringPurpose', 'Services and ideal clients', 'textarea', { required: true }),
      ],
    },
    {
      key: 'agencyDescription',
      title: 'Agency description',
      fields: [
        field('companyDescription', 'About your agency', 'textarea', { required: true }),
        field('companyTagline', 'Short tagline (optional)', 'text'),
      ],
    },
    {
      key: 'agencyExperience',
      title: 'Experience and projects',
      fields: [
        field('yearEstablished', 'Year established (optional)', 'number'),
        field('yearsInBusiness', 'Years of experience', 'number', { required: true }),
        field('projectsCompleted', 'Projects completed', 'number', { required: true }),
        field('notableProjects', 'Notable projects (optional)', 'textarea'),
      ],
    },
    {
      key: 'agencyLocation',
      title: 'Location and coverage',
      fields: [
        field('country', 'Country', 'text', { required: true }),
        field('state', 'State / region', 'text', { required: true }),
        field('city', 'City', 'select', { required: true, options: cityOptions }),
        field('companyAddress', 'Agency address (optional)', 'textarea'),
        field('hiringLocations', 'Hiring locations', 'multi', {
          required: true,
          options: cityOptions,
        }),
      ],
    },
    {
      key: 'agencyPortfolio',
      title: 'Portfolio',
      fields: [
        field('portfolioDescription', 'Portfolio introduction (optional)', 'textarea'),
        field('projectLinks', 'Project links (optional)', 'textarea', {
          placeholder: 'Add one project link per line',
        }),
        field('projectImage', 'Featured project image (optional)', 'photo'),
      ],
    },
    { key: 'review', title: 'Review and complete', fields: [] },
  ],
};

export function getRoleSteps(role, profile = {}) {
  const steps = roleProfileDefinitions[role];
  if (!steps) {
    return [];
  }
  if (role !== 'hiring') {
    return steps;
  }

  const hiringAs = profile.hiringAs;
  if (!hiringAs) {
    return [
      steps.find((step) => step.key === 'hiringAs'),
      steps.find((step) => step.key === 'review'),
    ];
  }

  const identityFields = hiringAs === 'organization'
    ? [
      field('companyName', 'Company name', 'text', { required: true }),
      field('companyLogo', 'Company logo (optional)', 'photo'),
      field('agencyType', 'Agency type', 'select', {
        required: true,
        options: ['Creative agency', 'Professional services agency', 'Staffing agency', 'Production agency', 'Other'],
      }),
      field('contactName', 'Contact person full name', 'text', { required: true }),
      field('designation', 'Designation', 'text', { required: true }),
      field('businessEmail', 'Business email', 'email', { required: true }),
      field('businessPhone', 'Business phone', 'phone', { required: true }),
      field('industry', 'Industry', 'text', { required: true }),
      field('companyWebsite', 'Company website (optional)', 'url'),
    ]
    : [
      field('fullName', 'Full name', 'text', { required: true }),
      field('email', 'Email address', 'email', { required: true }),
      field('profilePhoto', 'Profile photo (optional)', 'photo'),
      field('country', 'Country', 'text', { required: true }),
      field('state', 'State', 'text', { required: true }),
      field('city', 'City', 'select', { required: true, options: cityOptions }),
    ];

  if (hiringAs !== 'organization') {
    return [
      steps.find((step) => step.key === 'hiringAs'),
      {
        key: 'identity',
        title: 'Personal information',
        fields: identityFields,
      },
      {
        key: 'preferences',
        title: 'Hiring preferences',
        fields: [
          field('hiringCategories', 'Preferred hiring categories', 'multi', {
            required: true,
            options: serviceOptions,
          }),
          field('hiringPurpose', 'Hiring purpose', 'textarea', { required: true }),
          field('hiringLocations', 'Hiring locations', 'multi', {
            required: true,
            options: cityOptions,
          }),
          field('companyDescription', 'Company description (optional)', 'textarea'),
        ],
      },
      steps.find((step) => step.key === 'review'),
    ];
  }

  return steps.map((step) =>
    step.key === 'identity' ? { ...step, fields: identityFields } : step
  );
}

export function createInitialRoleProfile(role, user) {
  const profile = { ...(user?.profile?.roleProfiles?.[role]?.data || {}) };
  if (role === 'customer') {
    delete profile.preferredCategories;
  }
  if (!profile.fullName && user?.name) {
    profile.fullName = user.name;
  }
  if (!profile.email && user?.email) {
    profile.email = user.email;
  }
  if (role === 'business' && !profile.contactEmail && user?.email) {
    profile.contactEmail = user.email;
  }
  return profile;
}

export function profileFieldComplete(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export function getRoleProfileCompletion(role, profile) {
  const steps = getRoleSteps(role, profile);
  const requiredFields = steps.flatMap((step) => step.fields.filter((item) => item.required));
  const completeFields = requiredFields.filter((item) => profileFieldComplete(profile[item.key])).length;
  const missing = requiredFields
    .filter((item) => !profileFieldComplete(profile[item.key]))
    .map((item) => item.key);

  return {
    percentage: requiredFields.length
      ? Math.floor((completeFields / requiredFields.length) * 100)
      : 0,
    missing,
    complete: missing.length === 0,
  };
}
