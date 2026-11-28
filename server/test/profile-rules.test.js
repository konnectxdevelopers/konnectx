import test from 'node:test';
import assert from 'node:assert/strict';
import { getMissingProfileFields, getProfileCompletion } from '../src/profile-rules.js';

test('customer completion requires profile fields but not mobile verification', () => {
  const profile = {
    fullName: 'A User',
    email: 'user@example.com',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Madhapur',
    pinCode: '500081',
  };

  assert.deepEqual(getMissingProfileFields('customer', profile, { phone_verified: false }), []);
  assert.equal(getProfileCompletion('customer', profile, { phone_verified: false }).complete, true);
});

test('professional completion allows submission without phone verification', () => {
  const profile = {
    fullName: 'A User',
    email: 'user@example.com',
    headline: 'Electrician',
    primaryCategory: 'Repairs & maintenance',
    subCategory: 'Electrical',
    bio: 'Residential electrical repairs.',
    experienceYears: '4',
    skills: ['Wiring'],
    qualifications: 'Trade certificate',
    services: 'Repairs and installations',
    pricingType: 'Hourly',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    serviceAreas: ['Hyderabad'],
    workingRadius: '15',
    availableDays: ['Monday'],
    workingHours: '9:00 AM - 6:00 PM',
  };

  assert.deepEqual(getMissingProfileFields('professional', profile, { phone_verified: false }), []);
  assert.deepEqual(
    getProfileCompletion('professional', profile, { phone_verified: false }),
    { missing: [], percentage: 100, complete: true }
  );
});

test('business completion does not require optional registration or tax documents', () => {
  const profile = {
    companyName: 'Example Co',
    businessType: 'Sole proprietor',
    businessCategory: 'Home services',
    shortDescription: 'Home repair services',
    contactEmail: 'contact@example.com',
    contactName: 'A User',
    contactDesignation: 'Owner',
    businessPhone: '+911234567890',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    businessAddress: 'Madhapur, Hyderabad',
    pinCode: '500081',
    services: 'Repairs and maintenance',
    workingHours: '9:00 AM - 6:00 PM',
  };

  assert.equal(getProfileCompletion('business', profile, { phone_verified: false }).complete, true);
  assert.deepEqual(getMissingProfileFields('business', profile, { phone_verified: false }), []);
});

test('organization hiring profile validates organization fields only', () => {
  const profile = {
    hiringAs: 'organization',
    companyName: 'Example Co',
    agencyType: 'Creative agency',
    contactName: 'A User',
    designation: 'Recruiter',
    businessEmail: 'recruiter@example.com',
    businessPhone: '+911234567890',
    industry: 'Technology',
    companyDescription: 'A creative agency working with local businesses.',
    yearsInBusiness: '5',
    projectsCompleted: '12',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    hiringCategories: ['engineering'],
    hiringPurpose: 'Permanent hiring',
    hiringLocations: ['Hyderabad'],
  };

  assert.deepEqual(getMissingProfileFields('hiring', profile, { phone_verified: false }), []);
  const incompleteAgency = { ...profile };
  delete incompleteAgency.projectsCompleted;
  assert.deepEqual(
    getMissingProfileFields('hiring', incompleteAgency, { phone_verified: false }),
    ['projectsCompleted']
  );
});

test('optional fields do not affect required-field submit eligibility', () => {
  const profile = {
    hiringAs: 'individual',
    fullName: 'A User',
    email: 'user@example.com',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    hiringCategories: ['design'],
    hiringPurpose: 'Contract work',
    hiringLocations: ['Hyderabad'],
  };

  assert.equal(getProfileCompletion('hiring', profile, { phone_verified: false }).complete, true);
});
