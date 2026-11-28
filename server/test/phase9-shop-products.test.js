import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const SHOPPING_ROOT_ID = '20000000-0000-4000-8000-000000000002';
const FASHION_CAT_ID = '22000000-0000-4000-8000-000000000001';
const ELECTRONICS_CAT_ID = '22000000-0000-4000-8000-000000000002';

function makeTestConfig() {
  return {
    jwtSecret: 'test-secret-phase9-shop-products',
    jwtIssuer: 'konnectx-test',
    jwtAudience: 'konnectx-app',
    corsOrigins: [],
    uploadUrlTtlSeconds: 300,
    maxUploadBytes: 25000000,
    moderation: { requireReviewTypes: [] },
    email: { provider: 'console' },
    b2: {},
  };
}

function makeToken(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: '1h',
  });
}

function createPhase9MockPool() {
  const users = new Map([
    ['biz-1', { id: 'biz-1', name: 'Urban Merchant' }],
    ['biz-2', { id: 'biz-2', name: 'Other Business' }],
    ['cust-1', { id: 'cust-1', name: 'Shopper Alice' }],
  ]);
  const roles = new Set(['biz-1:business', 'biz-2:business', 'cust-1:customer']);
  const businessProfiles = new Map([
    ['biz-1', {
      user_id: 'biz-1',
      listing_id: 'biz-listing-1',
      hiring_enabled: 0,
      profile: JSON.stringify({
        companyName: 'Urban Store',
        businessType: 'Retail',
        description: 'Quality goods',
        address: '100 Market St',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        pinCode: '560001',
        email: 'shop@urban.test',
        phone: '+919900011122',
      }),
      shop_settings: JSON.stringify({ storeDisplayName: 'Urban Storefront', publicVisibility: true }),
      verification_status: 'verified',
    }],
  ]);
  const shopLocations = new Map();
  const categories = new Map([
    [SHOPPING_ROOT_ID, { id: SHOPPING_ROOT_ID, parent_id: null, listing_type: 'product', name: 'Shopping & Products', slug: 'shopping-products', is_active: 1 }],
    [FASHION_CAT_ID, { id: FASHION_CAT_ID, parent_id: SHOPPING_ROOT_ID, listing_type: 'product', name: 'Fashion', slug: 'fashion', is_active: 1 }],
    [ELECTRONICS_CAT_ID, { id: ELECTRONICS_CAT_ID, parent_id: SHOPPING_ROOT_ID, listing_type: 'product', name: 'Electronics', slug: 'electronics', is_active: 1 }],
  ]);
  const categoryRules = new Map([
    [FASHION_CAT_ID, {
      category_id: FASHION_CAT_ID,
      supports_variants: 1,
      supports_condition: 0,
      supports_warranty: 0,
      supports_return_policy: 1,
      supports_compare_at_price: 1,
      variant_attribute_keys: JSON.stringify(['size', 'color']),
      filterable_attribute_keys: JSON.stringify(['brand', 'size', 'color']),
      attributes: JSON.stringify([
        { key: 'brand', label: 'Brand', type: 'text', filterable: true },
        { key: 'size', label: 'Clothing size', type: 'select', options: ['S', 'M', 'L', 'XL'], variant: true, filterable: true },
        { key: 'color', label: 'Color', type: 'text', variant: true, filterable: true },
        { key: 'material', label: 'Material', type: 'text' },
      ]),
    }],
    [ELECTRONICS_CAT_ID, {
      category_id: ELECTRONICS_CAT_ID,
      supports_variants: 1,
      supports_condition: 1,
      supports_warranty: 1,
      supports_return_policy: 1,
      supports_compare_at_price: 1,
      variant_attribute_keys: JSON.stringify(['storage', 'color']),
      filterable_attribute_keys: JSON.stringify(['brand', 'color', 'storage']),
      attributes: JSON.stringify([
        { key: 'brand', label: 'Brand', type: 'text', filterable: true },
        { key: 'model', label: 'Model', type: 'text' },
        { key: 'color', label: 'Color', type: 'text', variant: true, filterable: true },
        { key: 'storage', label: 'Storage', type: 'select', options: ['128GB', '256GB', '512GB'], variant: true, filterable: true },
      ]),
    }],
  ]);
  const mediaAssets = new Map([
    ['media-cloth-1', { id: 'media-cloth-1', user_id: 'biz-1', role: 'business', purpose: 'listing-image', content_type: 'image/jpeg', byte_size: 4096, object_key: 'business/biz-1/listing-image/shirt.jpg', status: 'pending' }],
    ['media-elec-1', { id: 'media-elec-1', user_id: 'biz-1', role: 'business', purpose: 'product-image', content_type: 'image/png', byte_size: 8192, object_key: 'business/biz-1/product-image/phone.png', status: 'pending' }],
    ['media-shop-logo-1', { id: 'media-shop-logo-1', user_id: 'biz-1', role: 'business', purpose: 'business-logo', content_type: 'image/png', byte_size: 2048, object_key: 'business/biz-1/business-logo/logo.png', status: 'pending' }],
    ['media-shop-logo-2', { id: 'media-shop-logo-2', user_id: 'biz-2', role: 'business', purpose: 'business-logo', content_type: 'image/png', byte_size: 2048, object_key: 'business/biz-2/business-logo/logo.png', status: 'pending' }],
  ]);
  const products = new Map();
  const productVariants = new Map();
  const listingMedia = [];
  const marketplaceListings = new Map([
    ['biz-listing-1', { id: 'biz-listing-1', listing_type: 'business_profile', entity_id: 'biz-1', owner_user_id: 'biz-1', owner_role: 'business', status: 'published', is_public: 1, visibility: 'public' }],
  ]);
  const inventoryAdjustments = [];
  const statusHistory = [];

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT 1')) return [[{ result: 1 }]];
    if (s.startsWith('SELECT setting_value FROM marketplace_settings')) return [[]];

    if (s.startsWith('SELECT role FROM user_roles WHERE user_id = ? AND role = ?')) {
      return [roles.has(`${params[0]}:business`) ? [{ role: 'business', profile_completion_status: 'complete' }] : []];
    }

    if (s.startsWith('SELECT bp.*, ml.status AS listing_status')) {
      const bp = businessProfiles.get(params[0]);
      if (!bp) return [[]];
      const ml = marketplaceListings.get(bp.listing_id);
      return [[{ ...bp, listing_status: ml?.status || 'published', listing_is_public: ml?.is_public ?? 1, listing_visibility: ml?.visibility || 'public' }]];
    }

    if (s.startsWith('SELECT bp.*, u.name AS owner_name')) {
      const bp = businessProfiles.get(params[0]);
      if (!bp) return [[]];
      const ml = marketplaceListings.get(bp.listing_id);
      return [[{
        ...bp,
        owner_name: users.get(bp.user_id)?.name || null,
        listing_status: ml?.status || 'published',
        listing_is_public: ml?.is_public ?? 1,
        listing_visibility: ml?.visibility || 'public',
      }]];
    }

    if (s.startsWith('SELECT * FROM business_shop_locations WHERE business_user_id = ?')) {
      return [Array.from(shopLocations.values()).filter((l) => l.business_user_id === params[0])];
    }
    if (s.startsWith('SELECT * FROM business_shop_locations WHERE id = ? AND business_user_id = ?')) {
      const loc = shopLocations.get(params[0]);
      return [loc && loc.business_user_id === params[1] ? [loc] : []];
    }
    if (s.startsWith('SELECT id FROM media_assets WHERE id = ? AND user_id = ?')) {
      const asset = mediaAssets.get(params[0]);
      return [asset && asset.user_id === params[1] && asset.purpose === params[2] && asset.content_type.startsWith('image/')
        ? [{ id: asset.id }]
        : []];
    }
    if (s.startsWith('SELECT object_key FROM media_assets')) {
      const asset = mediaAssets.get(params[0]);
      return [asset && asset.user_id === params[1] ? [{ object_key: asset.object_key }] : []];
    }
    if (s.startsWith('SELECT id FROM business_shop_locations WHERE id = ? AND business_user_id = ?')) {
      const loc = shopLocations.get(params[0]);
      return [loc && loc.business_user_id === params[1] ? [{ id: loc.id }] : []];
    }
    if (s.startsWith('UPDATE business_shop_locations SET is_primary = FALSE')) {
      for (const l of shopLocations.values()) if (l.business_user_id === params[0]) l.is_primary = 0;
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO business_shop_locations')) {
      const [id, business_user_id, label, address, city, state, country, pin_code, phone, operating_hours, pickup_enabled, delivery_enabled, is_primary, is_active] = params;
      shopLocations.set(id, { id, business_user_id, label, address, city, state, country, pin_code, phone, operating_hours, pickup_enabled, delivery_enabled, is_primary, is_active, created_at: new Date(), updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE business_profiles SET profile')) {
      const bp = businessProfiles.get(params[2]);
      if (bp) {
        bp.profile = params[0];
        bp.shop_settings = params[1];
      }
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('SELECT COUNT(*) AS total, SUM(')) {
      const mine = Array.from(products.values()).filter((p) => p.seller_user_id === params[0] && p.status !== 'deleted');
      return [[{
        total: mine.length,
        published_count: mine.filter((p) => p.status === 'published' && p.is_active).length,
        draft_count: mine.filter((p) => p.status === 'draft').length,
        pending_count: mine.filter((p) => p.status === 'pending_review').length,
        paused_count: mine.filter((p) => p.status === 'paused').length,
        archived_count: mine.filter((p) => p.status === 'archived').length,
        out_of_stock_count: mine.filter((p) => p.stock_status === 'out_of_stock').length,
        low_stock_count: mine.filter((p) => p.stock_status === 'low_stock').length,
      }]];
    }

    if (s.startsWith('SELECT id, parent_id, name, slug FROM categories WHERE id IN')) {
      return [params.map((id) => categories.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT id, name, slug FROM categories WHERE id IN')) {
      return [params.map((id) => categories.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT * FROM product_category_rules WHERE category_id IN')) {
      return [params.map((id) => categoryRules.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT attribute_key, attribute_label')) return [[]];
    if (s.startsWith('SELECT c.id, c.parent_id, c.listing_type FROM categories c')) {
      const cat = categories.get(params[0]);
      return [cat && cat.listing_type === 'product' ? [cat] : []];
    }

    if (s.startsWith('SELECT id, object_key, content_type, byte_size, purpose FROM media_assets')) {
      const [userId, ...ids] = params;
      return [ids.map((id) => mediaAssets.get(id)).filter((a) => a && a.user_id === userId)];
    }

    if (s.startsWith('INSERT INTO products')) {
      const [
        id, seller_user_id, category_id, subcategory_id, shop_location_id,
        name, sku, short_description, description, brand, price, compare_at_price,
        currency, product_condition, stock_quantity, stock_status, variants, images,
        delivery_info, delivery_options, return_policy, warranty_info, attributes,
        is_active, status,
      ] = params;
      products.set(id, {
        id, seller_user_id, seller_role: 'business', category_id, subcategory_id, shop_location_id,
        name, sku, short_description, description, brand, price, compare_at_price,
        currency, product_condition, stock_quantity, stock_status, variants, images,
        delivery_info, delivery_options, return_policy, warranty_info, attributes,
        is_active, status, created_at: new Date(), updated_at: new Date(),
      });
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('SELECT p.*, ml.moderation_status FROM products p')) {
      const prod = products.get(params[0]);
      if (!prod || prod.seller_user_id !== params[1] || prod.status === 'deleted') return [[]];
      const ml = marketplaceListings.get(prod.id);
      return [[{ ...prod, moderation_status: ml?.moderation_status || null }]];
    }
    if (s.startsWith('SELECT p.*, ml.moderation_status, ml.moderation_reason FROM products p')) {
      const prod = products.get(params[0]);
      if (!prod || prod.seller_user_id !== params[1] || prod.status === 'deleted') return [[]];
      const ml = marketplaceListings.get(prod.id);
      return [[{ ...prod, moderation_status: ml?.moderation_status || null, moderation_reason: ml?.moderation_reason || null }]];
    }

    if (s.startsWith('UPDATE products SET status = ?')) {
      const prod = products.get(params[1]);
      if (prod && prod.seller_user_id === params[2]) prod.status = params[0];
      return [{ affectedRows: prod ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE products SET category_id = ?')) {
      const [
        category_id, subcategory_id, shop_location_id, name, sku, short_description, description,
        brand, price, compare_at_price, currency, product_condition, stock_quantity, stock_status,
        delivery_info, delivery_options, return_policy, warranty_info, attributes, is_active, status, id, ownerId,
      ] = params;
      const prod = products.get(id);
      if (prod && prod.seller_user_id === ownerId) {
        Object.assign(prod, {
          category_id, subcategory_id, shop_location_id, name, sku, short_description, description,
          brand, price, compare_at_price, currency, product_condition, stock_quantity, stock_status,
          delivery_info, delivery_options, return_policy, warranty_info, attributes, is_active, status,
        });
      }
      return [{ affectedRows: prod ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE products SET stock_quantity = ?, stock_status = ?, variants = ?')) {
      const prod = products.get(params[3]);
      if (prod) {
        prod.stock_quantity = params[0];
        prod.stock_status = params[1];
        prod.variants = params[2];
      }
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE products SET images = ?')) {
      const prod = products.get(params[1]);
      if (prod) prod.images = params[0];
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT stock_quantity FROM products WHERE id = ?')) {
      const prod = products.get(params[0]);
      return [prod ? [{ stock_quantity: prod.stock_quantity }] : []];
    }
    if (s.startsWith('SELECT stock_quantity, stock_status FROM products WHERE id = ?')) {
      const prod = products.get(params[0]);
      return [prod ? [{ stock_quantity: prod.stock_quantity, stock_status: prod.stock_status }] : []];
    }
    if (s.startsWith('SELECT id, seller_user_id, stock_quantity FROM products WHERE id = ?')) {
      const prod = products.get(params[0]);
      return [prod && prod.seller_user_id === params[1] ? [prod] : []];
    }
    if (s.startsWith('SELECT id, price FROM products WHERE id = ?')) {
      const prod = products.get(params[0]);
      return [prod && prod.seller_user_id === params[1] ? [prod] : []];
    }
    if (s.startsWith('SELECT id, name, stock_quantity, stock_status FROM products')) {
      const prod = products.get(params[0]);
      return [prod && prod.seller_user_id === params[1] ? [prod] : []];
    }

    if (s.startsWith('SELECT id, stock_quantity, version FROM product_variants WHERE product_id = ?')) {
      return [Array.from(productVariants.values()).filter((v) => v.product_id === params[0])];
    }
    if (s.startsWith('SELECT id, stock_quantity FROM product_variants WHERE product_id = ?')) {
      return [Array.from(productVariants.values()).filter((v) => v.product_id === params[0])];
    }
    if (s.startsWith('SELECT attributes, is_active FROM product_variants WHERE product_id = ?')) {
      return [Array.from(productVariants.values()).filter((v) => v.product_id === params[0] && v.is_active)];
    }
    if (s.startsWith('SELECT product_id, attributes FROM product_variants WHERE product_id IN')) {
      return [Array.from(productVariants.values())
        .filter((v) => params.includes(v.product_id) && v.is_active)
        .map((v) => ({ product_id: v.product_id, attributes: v.attributes }))];
    }
    if (s.startsWith('SELECT id, stock_quantity, version FROM product_variants WHERE id = ?')) {
      const v = productVariants.get(params[0]);
      return [v && v.product_id === params[1] ? [v] : []];
    }
    if (s.startsWith('SELECT * FROM product_variants WHERE id = ?')) {
      const v = productVariants.get(params[0]);
      return [v && v.product_id === params[1] ? [v] : []];
    }
    if (s.startsWith('SELECT * FROM product_variants WHERE product_id = ? AND is_active = TRUE')) {
      return [Array.from(productVariants.values()).filter((v) => v.product_id === params[0] && v.is_active)];
    }
    if (s.startsWith('SELECT * FROM product_variants WHERE product_id IN')) {
      return [Array.from(productVariants.values()).filter((v) => params.includes(v.product_id))];
    }
    if (s.startsWith('SELECT * FROM product_variants WHERE product_id = ?')) {
      return [Array.from(productVariants.values()).filter((v) => v.product_id === params[0])];
    }
    if (s.startsWith('SELECT COUNT(*) AS count FROM product_variants')) {
      const cnt = Array.from(productVariants.values()).filter((v) => v.product_id === params[0] && v.is_active).length;
      return [[{ count: cnt }]];
    }
    if (s.startsWith('INSERT INTO product_variants')) {
      const [id, product_id, sku, name, attributes, price, compare_at_price, stock_quantity, is_active] = params;
      productVariants.set(id, { id, product_id, sku, name, attributes, price, compare_at_price, stock_quantity, is_active, version: 0, created_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE product_variants SET stock_quantity = ?, version = version + 1')) {
      const v = productVariants.get(params[1]);
      if (v) {
        v.stock_quantity = params[0];
        v.version += 1;
      }
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE product_variants SET sku = ?')) {
      const [sku, name, attributes, price, compare_at_price, stock_quantity, is_active, id, product_id] = params;
      const variant = productVariants.get(id);
      if (variant && variant.product_id === product_id) {
        Object.assign(variant, { sku, name, attributes, price, compare_at_price, stock_quantity, is_active });
        variant.version += 1;
      }
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE product_variants SET is_active = FALSE')) {
      const variant = productVariants.get(params[0]);
      if (variant && variant.product_id === params[1]) {
        variant.is_active = false;
        variant.version += 1;
      }
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('DELETE FROM listing_media')) {
      for (let i = listingMedia.length - 1; i >= 0; i -= 1) {
        if (listingMedia[i].listing_id === params[0]) listingMedia.splice(i, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO listing_media')) {
      const [id, listing_id, media_asset_id, media_role, display_order, is_cover, alt_text, mime_type, file_size, object_key] = params;
      listingMedia.push({ id, listing_type: 'product', listing_id, media_asset_id, media_role, display_order, is_cover, alt_text, mime_type, file_size, object_key, created_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE media_assets SET status =')) {
      const asset = mediaAssets.get(params[0]);
      if (asset) asset.status = 'attached';
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT lm.id, lm.listing_id')) {
      return [listingMedia.filter((m) => params.includes(m.listing_id))];
    }
    if (s.startsWith('SELECT id FROM listing_media')) {
      return [listingMedia.filter((m) => m.listing_id === params[0] && m.media_role === 'image').map((m) => ({ id: m.id }))];
    }

    if (s.startsWith('INSERT INTO marketplace_listings')) {
      const [id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id, title, short_summary, description, location, visibility, status, is_public] = params;
      marketplaceListings.set(id, { id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id, title, short_summary, description, location, visibility, status, is_public });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE marketplace_listings SET status')) {
      const ml = marketplaceListings.get(params[params.length - 1]);
      if (ml) {
        ml.status = params[0];
        ml.is_public = params[0] === 'published' ? 1 : 0;
      }
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('INSERT INTO listing_status_history')) {
      statusHistory.push(params);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO inventory_adjustments')) {
      const [id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason] = params;
      inventoryAdjustments.push({ id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason, created_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM inventory_adjustments WHERE product_id = ?')) {
      return [inventoryAdjustments.filter((h) => h.product_id === params[0])];
    }

    if (s.startsWith('SELECT p.*, u.name AS seller_name')) {
      if (s.includes('WHERE p.id = ? AND p.seller_user_id = ? AND p.status !=')) {
        const prod = products.get(params[0]);
        if (!prod || prod.seller_user_id !== params[1]) return [[]];
        const bp = businessProfiles.get(prod.seller_user_id);
        const productListing = marketplaceListings.get(prod.id);
        const businessListing = marketplaceListings.get(bp?.listing_id);
        return [[{
          ...prod,
          business_profile_user_id: bp?.user_id || null,
          business_listing_id: bp?.listing_id || null,
          business_listing_status: businessListing?.status || null,
          business_listing_is_public: businessListing?.is_public ?? null,
          business_listing_visibility: businessListing?.visibility || null,
          seller_name: users.get(prod.seller_user_id)?.name || null,
          business_profile: bp?.profile || null,
          verification_status: bp?.verification_status || 'pending',
          shop_settings: bp?.shop_settings || null,
          moderation_status: productListing?.moderation_status || null,
          moderation_reason: productListing?.moderation_reason || null,
        }]];
      }
      if (s.includes('WHERE p.id = ? AND p.status !=')) {
        const prod = products.get(params[0]);
        if (!prod) return [[]];
        const bp = businessProfiles.get(prod.seller_user_id);
        const ml = marketplaceListings.get(prod.id);
        return [[{
          ...prod,
          business_profile_user_id: bp?.user_id || null,
          business_listing_id: bp?.listing_id || null,
          seller_name: users.get(prod.seller_user_id)?.name || null,
          business_name: bp?.business_name || null,
          business_profile: bp?.profile || null,
          verification_status: bp?.verification_status || 'pending',
          shop_settings: bp?.shop_settings || null,
          business_listing_status: marketplaceListings.get(bp?.listing_id)?.status || null,
          business_listing_is_public: marketplaceListings.get(bp?.listing_id)?.is_public ?? null,
          business_listing_visibility: marketplaceListings.get(bp?.listing_id)?.visibility || null,
          listing_status: ml?.status || prod.status,
          listing_is_public: ml?.is_public ?? 1,
          listing_visibility: ml?.visibility || 'public',
        }]];
      }
      if (s.includes('WHERE p.id = ? LIMIT 1')) {
        const prod = products.get(params[0]);
        if (!prod) return [[]];
        const bp = businessProfiles.get(prod.seller_user_id);
        return [[{ ...prod, seller_name: users.get(prod.seller_user_id)?.name || null, business_profile: bp?.profile || null, verification_status: bp?.verification_status || 'pending', shop_settings: bp?.shop_settings || null }]];
      }
      // Discovery query
      const items = Array.from(products.values()).filter((p) => {
        if (s.includes("p.status = 'published'")) {
          if (p.status !== 'published' || !p.is_active) return false;
          const bp = businessProfiles.get(p.seller_user_id);
          const productListing = marketplaceListings.get(p.id);
          const businessListing = marketplaceListings.get(bp?.listing_id);
          const settings = bp ? JSON.parse(bp.shop_settings || '{}') : {};
          if (!bp || !productListing || productListing.status !== 'published' || !productListing.is_public || productListing.visibility !== 'public') return false;
          if (bp.listing_id && (!businessListing || businessListing.status !== 'published' || !businessListing.is_public || businessListing.visibility !== 'public')) return false;
          if (settings.publicVisibility === false) return false;
        }
        return true;
      });
      const filtered = items.filter((p) => {
        if (s.includes('WHERE p.seller_user_id = ?') && p.seller_user_id !== params[0]) return false;
        if (s.includes('p.category_id = ?') && !params.includes(p.category_id)) return false;
        if (s.includes('p.product_condition = ?') && !params.includes(p.product_condition)) return false;
        if (s.includes("LOWER(COALESCE(p.brand") && !params.includes(String(p.brand || '').toLowerCase())) return false;
        if (s.includes("JSON_EXTRACT(pv.attributes, '$.size')")) {
          const vList = Array.from(productVariants.values()).filter((v) => v.product_id === p.id && v.is_active);
          const wanted = params.find((x) => typeof x === 'string' && vList.some((v) => String(JSON.parse(v.attributes).size || '').toLowerCase() === x));
          if (!wanted) return false;
        }
        for (let i = 0; i < params.length - 1; i += 1) {
          const path = params[i];
          if (typeof path !== 'string' || !/^\$\.[a-zA-Z0-9_]+$/.test(path)) continue;
          const key = path.slice(2);
          const expected = String(params[i + 1]).toLowerCase();
          const productAttrs = JSON.parse(p.attributes || '{}');
          const matchesProduct = String(productAttrs[key] || '').toLowerCase() === expected;
          const matchesVariant = Array.from(productVariants.values()).some((v) => {
            if (v.product_id !== p.id || !v.is_active) return false;
            return String(JSON.parse(v.attributes || '{}')[key] || '').toLowerCase() === expected;
          });
          if (!matchesProduct && !matchesVariant) return false;
          i += 3;
        }
        return true;
      });
      return [filtered.map((p) => {
        const bp = businessProfiles.get(p.seller_user_id);
        const businessListing = marketplaceListings.get(bp?.listing_id);
        const productListing = marketplaceListings.get(p.id);
        return {
          ...p,
          business_profile_user_id: bp?.user_id || null,
          business_listing_id: bp?.listing_id || null,
          business_listing_status: businessListing?.status || null,
          business_listing_is_public: businessListing?.is_public ?? null,
          business_listing_visibility: businessListing?.visibility || null,
          listing_status: productListing?.status || p.status,
          listing_is_public: productListing?.is_public ?? 1,
          listing_visibility: productListing?.visibility || 'public',
          seller_name: users.get(p.seller_user_id)?.name || null,
          business_profile: bp?.profile || null,
          verification_status: bp?.verification_status || 'pending',
          shop_settings: bp?.shop_settings || null,
        };
      })];
    }

    if (s.startsWith('SELECT COUNT(*) AS total FROM products p')) {
      return [[{ total: products.size }]];
    }
    if (s.startsWith('SELECT p.id, p.brand, p.product_condition, p.attributes FROM products p')) {
      const pub = Array.from(products.values()).filter((p) => {
        if (p.status !== 'published' || !p.is_active) return false;
        if (params.length && !params.includes(p.category_id) && !params.includes(p.subcategory_id)) return false;
        const bp = businessProfiles.get(p.seller_user_id);
        const listing = marketplaceListings.get(p.id);
        const businessListing = marketplaceListings.get(bp?.listing_id);
        const settings = bp ? JSON.parse(bp.shop_settings || '{}') : {};
        return Boolean(bp && listing?.status === 'published' && listing.is_public &&
          listing.visibility === 'public' && (!bp.listing_id || (
            businessListing?.status === 'published' && businessListing.is_public && businessListing.visibility === 'public'
          )) && settings.publicVisibility !== false);
      });
      return [pub];
    }

    return [[]];
  }

  return {
    query,
    mediaAssets,
    async getConnection() {
      return {
        query,
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
  };
}

test('Phase 9: Shop setup, dynamic category products, variants, transactional inventory, lifecycle, and customer filtering', async () => {
  const config = makeTestConfig();
  const pool = createPhase9MockPool();
  const app = createApp({ pool, config });
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const bizToken = makeToken('biz-1', config);
  const otherBizToken = makeToken('biz-2', config);
  const customerToken = makeToken('cust-1', config);

  try {
    // 1. Customer cannot update business shop
    const deniedShop = await fetch(`${baseUrl}/api/v1/business/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ storeDisplayName: 'Hacked' }),
    });
    assert.equal(deniedShop.status, 403);

    // 2. Business updates shop & adds a store location
    const shopRes = await fetch(`${baseUrl}/api/v1/business/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        storeDisplayName: 'Urban Flagship',
        pickupEnabled: true,
        deliveryEnabled: true,
        logoMediaId: 'media-shop-logo-1',
      }),
    });
    assert.equal(shopRes.status, 200);
    const shopBody = await shopRes.json();
    assert.equal(shopBody.shop.storeDisplayName, 'Urban Flagship');
    assert.equal(shopBody.shop.logoMediaId, 'media-shop-logo-1');
    assert.equal(pool.mediaAssets.get('media-shop-logo-1').status, 'attached');

    const foreignShopLogo = await fetch(`${baseUrl}/api/v1/business/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({ logoMediaId: 'media-shop-logo-2' }),
    });
    assert.equal(foreignShopLogo.status, 400);

    const locRes = await fetch(`${baseUrl}/api/v1/business/shop/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        label: 'Indiranagar Store',
        address: '100 Feet Road',
        city: 'Bengaluru',
        isPrimary: true,
      }),
    });
    assert.equal(locRes.status, 201);
    const locBody = await locRes.json();
    assert.equal(locBody.location.city, 'Bengaluru');

    // 3. Category schemas differ appropriately (Electronics has no clothing size!)
    const fashionSchemaRes = await fetch(`${baseUrl}/api/v1/marketplace/products/categories/${FASHION_CAT_ID}/schema`);
    assert.equal(fashionSchemaRes.status, 200);
    const fashionSchema = (await fashionSchemaRes.json()).schema;
    assert.equal(fashionSchema.supportsCondition, false);
    assert.ok(fashionSchema.variantAttributeKeys.includes('size'));

    const elecSchemaRes = await fetch(`${baseUrl}/api/v1/marketplace/products/categories/${ELECTRONICS_CAT_ID}/schema`);
    assert.equal(elecSchemaRes.status, 200);
    const elecSchema = (await elecSchemaRes.json()).schema;
    assert.equal(elecSchema.supportsCondition, true);
    assert.equal(elecSchema.supportsWarranty, true);
    assert.ok(!elecSchema.variantAttributeKeys.includes('size'));

    const invalidProductAttribute = await fetch(`${baseUrl}/api/v1/marketplace/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        action: 'save_draft',
        name: 'Invalid category attribute',
        categoryId: FASHION_CAT_ID,
        attributes: { size: 'M' },
      }),
    });
    assert.equal(invalidProductAttribute.status, 400);

    const invalidVariantPayload = await fetch(`${baseUrl}/api/v1/marketplace/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        action: 'save_draft',
        name: 'Invalid variant payload',
        categoryId: FASHION_CAT_ID,
        variants: { size: 'M' },
      }),
    });
    assert.equal(invalidVariantPayload.status, 400);

    const imageLessDraftRes = await fetch(`${baseUrl}/api/v1/marketplace/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        action: 'save_draft',
        name: 'Image-free draft',
        description: 'This draft has not been given a product image.',
        categoryId: FASHION_CAT_ID,
        price: 99,
      }),
    });
    assert.equal(imageLessDraftRes.status, 201);
    const imageLessDraft = (await imageLessDraftRes.json()).product;
    const imageLessSubmitRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${imageLessDraft.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({ action: 'submit' }),
    });
    assert.equal(imageLessSubmitRes.status, 400);
    assert.equal((await imageLessSubmitRes.json()).code, 'product_image_required');

    // 4. Create clothing product with size/color variants + media
    const clothRes = await fetch(`${baseUrl}/api/v1/marketplace/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        action: 'publish',
        name: 'Cotton Linen Shirt',
        brand: 'UrbanCo',
        description: 'Breathable summer cotton shirt.',
        categoryId: FASHION_CAT_ID,
        shopLocationId: locBody.location.id,
        price: 1299,
        compareAtPrice: 1799,
        mediaAssetIds: ['media-cloth-1'],
        variants: [
          { sku: 'SHIRT-M-BLK', price: 1299, stockQuantity: 4, attributes: { size: 'M', color: 'Black' } },
          { sku: 'SHIRT-L-WHT', price: 1299, stockQuantity: 6, attributes: { size: 'L', color: 'White' } },
        ],
      }),
    });
    assert.equal(clothRes.status, 201);
    const clothProduct = (await clothRes.json()).product;
    assert.equal(clothProduct.status, 'published');
    assert.equal(clothProduct.stockQuantity, 10);
    assert.equal(clothProduct.variants.length, 2);

    // 5. Create electronics product
    const phoneRes = await fetch(`${baseUrl}/api/v1/marketplace/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        action: 'publish',
        name: 'Nova Pro Phone',
        brand: 'NovaTech',
        description: 'Flagship smartphone with OLED screen.',
        categoryId: ELECTRONICS_CAT_ID,
        productCondition: 'new',
        warrantyInfo: '1 Year Manufacturer Warranty',
        price: 49999,
        mediaAssetIds: ['media-elec-1'],
        variants: [
          { sku: 'NOVA-256-SLV', price: 49999, stockQuantity: 3, attributes: { storage: '256GB', color: 'Silver' } },
          { sku: 'NOVA-128-BLK', price: 45999, stockQuantity: 2, attributes: { storage: '128GB', color: 'Black' }, isActive: false },
        ],
      }),
    });
    assert.equal(phoneRes.status, 201);
    const phoneProduct = (await phoneRes.json()).product;
    assert.equal(phoneProduct.stockStatus, 'low_stock');
    assert.equal(phoneProduct.variants.length, 2);

    // 6. Transactional stock adjustment prevents negative stock & increments version
    const targetVariant = clothProduct.variants[0];
    const negRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        variantId: targetVariant.id,
        mode: 'delta',
        delta: -10,
        reason: 'Invalid deduction',
      }),
    });
    assert.equal(negRes.status, 400);
    assert.equal((await negRes.json()).code, 'negative_stock_forbidden');

    const stockRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        variantId: targetVariant.id,
        mode: 'delta',
        delta: 5,
        expectedVersion: targetVariant.version,
        reason: 'Restocked batch',
      }),
    });
    assert.equal(stockRes.status, 200);
    const stockBody = await stockRes.json();
    assert.equal(stockBody.adjustment.newQuantity, 9);
    assert.equal(stockBody.productStockQuantity, 15);

    const staleStockEditRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        name: clothProduct.name,
        description: clothProduct.description,
        categoryId: clothProduct.categoryId,
        brand: clothProduct.brand,
        attributes: clothProduct.attributes,
        price: clothProduct.price,
        stockQuantity: 16,
        variants: clothProduct.variants.map((variant, index) => ({
          ...variant,
          stockQuantity: index === 0 ? 10 : variant.stockQuantity,
        })),
      }),
    });
    assert.equal(staleStockEditRes.status, 409);
    assert.equal((await staleStockEditRes.json()).code, 'stock_version_conflict');

    const refreshedClothRes = await fetch(`${baseUrl}/api/v1/marketplace/my-products/${clothProduct.id}`, {
      headers: { Authorization: `Bearer ${bizToken}` },
    });
    const refreshedCloth = (await refreshedClothRes.json()).product;
    const productEditRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({
        name: refreshedCloth.name,
        description: refreshedCloth.description,
        shortDescription: refreshedCloth.shortDescription,
        categoryId: refreshedCloth.categoryId,
        subcategoryId: refreshedCloth.subcategoryId,
        shopLocationId: refreshedCloth.shopLocationId,
        brand: refreshedCloth.brand,
        attributes: refreshedCloth.attributes,
        price: refreshedCloth.price,
        compareAtPrice: refreshedCloth.compareAtPrice,
        stockQuantity: 16,
        currency: refreshedCloth.currency,
        mediaAssetIds: refreshedCloth.media.map((item) => item.mediaAssetId),
        variants: refreshedCloth.variants.map((variant, index) => ({
          ...variant,
          stockQuantity: index === 0 ? 10 : variant.stockQuantity,
        })),
      }),
    });
    const productEditBody = await productEditRes.json();
    assert.equal(productEditRes.status, 200, JSON.stringify(productEditBody));
    assert.equal(productEditBody.product.stockQuantity, 16);
    const historyRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}/inventory`, {
      headers: { Authorization: `Bearer ${bizToken}` },
    });
    assert.equal(historyRes.status, 200);
    const editHistory = (await historyRes.json()).history;
    assert.ok(editHistory.some((entry) => entry.reason === 'Product edit' && entry.delta === 1));

    // 7. Unauthorized user cannot edit stock
    const unauthStock = await fetch(`${baseUrl}/api/v1/marketplace/products/${clothProduct.id}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherBizToken}` },
      body: JSON.stringify({ variantId: targetVariant.id, mode: 'set', newQuantity: 100 }),
    });
    assert.equal(unauthStock.status, 404);

    // 8. Pause hides product from public discovery & detail; resume brings it back
    const pauseRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${phoneProduct.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({ action: 'pause' }),
    });
    assert.equal(pauseRes.status, 200);

    const hiddenDetailRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${phoneProduct.id}`);
    assert.equal(hiddenDetailRes.status, 404);

    const resumeRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${phoneProduct.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({ action: 'resume' }),
    });
    assert.equal(resumeRes.status, 200);
    const phoneDetailRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${phoneProduct.id}`);
    assert.equal(phoneDetailRes.status, 200);
    const phoneDetail = (await phoneDetailRes.json()).product;
    assert.equal(phoneDetail.variants.length, 1);

    // 9. Customer filters by category + size
    const filteredRes = await fetch(`${baseUrl}/api/v1/marketplace/products?categoryId=${FASHION_CAT_ID}&size=M`);
    assert.equal(filteredRes.status, 200);
    const filteredBody = await filteredRes.json();
    assert.equal(filteredBody.products.length, 1);
    assert.equal(filteredBody.products[0].id, clothProduct.id);
    assert.ok(filteredBody.facets.brands.includes('UrbanCo'));

    const storageFilterRes = await fetch(
      `${baseUrl}/api/v1/marketplace/products?categoryId=${ELECTRONICS_CAT_ID}&attributeFilters=${encodeURIComponent(JSON.stringify({ storage: '256GB' }))}`
    );
    assert.equal(storageFilterRes.status, 200);
    const storageFilterBody = await storageFilterRes.json();
    assert.equal(storageFilterBody.products.length, 1);
    assert.deepEqual(storageFilterBody.facets.attributes.find((item) => item.key === 'storage')?.values, ['256GB']);

    const invalidFilterRes = await fetch(
      `${baseUrl}/api/v1/marketplace/products?categoryId=${ELECTRONICS_CAT_ID}&attributeFilters=${encodeURIComponent(JSON.stringify({ size: 'M' }))}`
    );
    assert.equal(invalidFilterRes.status, 400);

    const hideShopRes = await fetch(`${baseUrl}/api/v1/business/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bizToken}` },
      body: JSON.stringify({ publicVisibility: false }),
    });
    assert.equal(hideShopRes.status, 200);
    const hiddenProductsRes = await fetch(`${baseUrl}/api/v1/marketplace/products`);
    assert.equal((await hiddenProductsRes.json()).products.length, 0);
    const hiddenShopProductRes = await fetch(`${baseUrl}/api/v1/marketplace/products/${phoneProduct.id}`);
    assert.equal(hiddenShopProductRes.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
