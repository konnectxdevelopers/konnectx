import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { apiRequest } from '../api/apiClient';

function authHeaders(session) {
  if (!session?.token) {
    throw new Error('Sign in is required to save a role profile.');
  }
  return { Authorization: `Bearer ${session.token}` };
}

export async function selectRoleRequest(session, role) {
  return apiRequest('/api/v1/users/select-role', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ role }),
  });
}

export async function getCurrentUserRequest(session) {
  const response = await apiRequest('/api/v1/users/me', {
    headers: authHeaders(session),
  });
  return response?.user || null;
}

export async function getRoleProfileRequest(session, role) {
  return apiRequest(`/api/v1/profiles/${encodeURIComponent(role)}`, {
    headers: authHeaders(session),
  });
}

export async function getRoleDashboardRequest(session, role) {
  return apiRequest(`/api/v1/dashboard/${encodeURIComponent(role)}`, {
    headers: authHeaders(session),
  });
}

export async function getMediaUrlRequest(session, assetId) {
  const result = await apiRequest(`/api/v1/uploads/${encodeURIComponent(assetId)}/url`, {
    headers: authHeaders(session),
  });
  return result.url;
}

async function uploadAsset(session, role, purpose, source, defaultContentType) {
  const uri = typeof source === 'string' ? source : source?.uri;
  if (!uri) {
    throw new Error('The selected file is missing its local URI.');
  }

  let fileBody;
  let detectedContentType;
  let byteSize;
  if (/^(file|content):/i.test(uri)) {
    try {
      const file = new File(uri);
      fileBody = file;
      byteSize =
        typeof source === 'object' && Number.isFinite(source.size)
          ? source.size
          : file.size;
      if (!Number.isFinite(byteSize)) {
        throw new Error('The selected file size could not be determined.');
      }
      detectedContentType = file.type;
    } catch (error) {
      throw new Error('The selected file could not be read.', { cause: error });
    }
  } else {
    const fileResponse = await fetch(uri);
    if (!fileResponse.ok) {
      throw new Error('The selected file could not be read.');
    }
    fileBody = await fileResponse.arrayBuffer();
    byteSize = fileBody.byteLength;
    detectedContentType = fileResponse.headers.get('content-type');
  }

  const contentType =
    (typeof source === 'object' && (source.mimeType || source.type)) ||
    detectedContentType ||
    defaultContentType;
  const headers = authHeaders(session);
  const signedUpload = await apiRequest('/api/v1/uploads/presign', {
    method: 'POST',
    headers,
    body: JSON.stringify({ role, purpose, contentType, byteSize }),
  });
  const uploadResponse = await expoFetch(signedUpload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBody,
  });
  if (!uploadResponse.ok) {
    throw new Error(`File upload failed with status ${uploadResponse.status}.`);
  }
  const asset = await apiRequest('/api/v1/uploads/complete', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      objectKey: signedUpload.objectKey,
      role,
      purpose,
      contentType,
      byteSize,
    }),
  });
  return {
    ...asset,
    ...(typeof source === 'object' && source.name ? { name: source.name } : {}),
    ...(purpose.includes('photo') || purpose === 'service-image' || purpose === 'business-logo' ||
      purpose === 'cover-image' || purpose === 'portfolio-image'
      ? { previewUri: uri }
      : {}),
  };
}

export async function uploadServiceMediaRequest(session, role, source, mediaType) {
  if (!['professional', 'business'].includes(role)) {
    throw new Error('Only professionals and businesses can upload service media.');
  }
  if (!['image', 'video'].includes(mediaType)) {
    throw new Error('Choose an image or video file.');
  }
  return uploadAsset(
    session,
    role,
    mediaType === 'image' ? 'service-image' : 'service-video',
    source,
    mediaType === 'image' ? 'image/jpeg' : 'video/mp4'
  );
}

export async function uploadProductImageRequest(session, source) {
  return uploadAsset(session, 'business', 'product-image', source, 'image/jpeg');
}

export async function uploadBusinessShopMediaRequest(session, source, mediaType) {
  if (!['logo', 'cover'].includes(mediaType)) {
    throw new Error('Choose a store logo or cover image.');
  }
  return uploadAsset(
    session,
    'business',
    mediaType === 'logo' ? 'business-logo' : 'cover-image',
    source,
    'image/jpeg'
  );
}

export async function uploadProjectAttachmentRequest(session, source, role = 'hiring') {
  return uploadAsset(session, role, 'project-attachment', source, 'application/pdf');
}

export async function uploadResumeAttachmentRequest(session, role, source) {
  return uploadAsset(session, role || 'customer', 'application-resume', source, 'application/pdf');
}

export async function uploadProposalAttachmentRequest(session, role, source) {
  return uploadAsset(session, role || 'professional', 'proposal-attachment', source, 'application/pdf');
}

export async function uploadPortfolioMediaRequest(session, source, mediaType = 'image') {
  if (!['image', 'video'].includes(mediaType)) {
    throw new Error('Choose an image or video file.');
  }
  return uploadAsset(
    session,
    'professional',
    mediaType === 'video' ? 'portfolio-video' : 'portfolio-image',
    source,
    mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
  );
}

export async function uploadListingMediaRequest(session, role, source, mediaType = 'image') {
  if (!['professional', 'business', 'hiring'].includes(role)) {
    throw new Error('Only professional, business, or hiring accounts can upload listing media.');
  }
  const purpose = mediaType === 'video'
    ? 'listing-video'
    : mediaType === 'document'
      ? 'listing-document'
      : 'listing-image';
  const fallbackMime = mediaType === 'video'
    ? 'video/mp4'
    : mediaType === 'document'
      ? 'application/pdf'
      : 'image/jpeg';
  return uploadAsset(session, role, purpose, source, fallbackMime);
}

export async function deletePendingUploadRequest(session, assetId) {
  return apiRequest(`/api/v1/uploads/pending/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

async function uploadProfileAssets(session, role, profile) {
  const assetFields = {
    profilePhoto: { purpose: 'profile-photo', contentType: 'image/jpeg' },
    businessLogo: { purpose: 'business-logo', contentType: 'image/jpeg' },
    coverImage: { purpose: 'cover-image', contentType: 'image/jpeg' },
    companyLogo: { purpose: 'business-logo', contentType: 'image/jpeg' },
    projectImage: { purpose: 'portfolio-image', contentType: 'image/jpeg' },
    portfolioVideo: { purpose: 'portfolio-video', contentType: 'video/mp4' },
    certificateFile: { purpose: 'certificate', contentType: 'application/pdf' },
    verificationDocument: {
      purpose: 'verification-document',
      contentType: 'application/pdf',
    },
  };
  const nextProfile = { ...profile };
  for (const [field, assetInfo] of Object.entries(assetFields)) {
    const source = nextProfile[field];
    const isLocalUri = typeof source === 'string' && /^(file|blob|content):/.test(source);
    const isPickedFile = source && typeof source === 'object' && source.uri && !source.id;
    if (isLocalUri || isPickedFile) {
      nextProfile[field] = await uploadAsset(
        session,
        role,
        assetInfo.purpose,
        source,
        assetInfo.contentType
      );
    }
  }
  return nextProfile;
}

function profileForPersistence(profile) {
  return Object.fromEntries(
    Object.entries(profile).map(([key, value]) => {
      if (value && typeof value === 'object' && value.id && value.objectKey) {
        const { previewUri, uri, ...asset } = value;
        return [key, asset];
      }
      return [key, value];
    })
  );
}

export async function saveRoleProfileRequest(
  session,
  role,
  profile,
  { submit = false } = {}
) {
  const uploadedProfile = await uploadProfileAssets(session, role, profile);
  const saved = await apiRequest(`/api/v1/profiles/${encodeURIComponent(role)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: JSON.stringify({ profile: profileForPersistence(uploadedProfile), submit }),
  });
  return { ...saved, profile: uploadedProfile };
}
