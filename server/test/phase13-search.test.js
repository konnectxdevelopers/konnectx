import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSearchRecommendationsRoutes } from '../src/search-recommendations-routes.js';

function createRouteHarness(pool) {
  const handlers = new Map();
  const router = {
    get(path, handler) {
      handlers.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      handlers.set(`POST ${path}`, handler);
    },
    delete(path, handler) {
      handlers.set(`DELETE ${path}`, handler);
    },
  };
  registerSearchRecommendationsRoutes(router, {
    pool,
    config: {},
    authenticate: (_req, _res, next) => next(),
  });
  return handlers;
}

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('Phase 13 filter metadata exposes actual categories and their subcategories', async () => {
  const categoryRows = [
    {
      id: 'products-root',
      name: 'Shopping & Products',
      parentId: null,
      listingType: 'product',
      parentListingType: null,
      rootListingType: null,
    },
    {
      id: 'fashion',
      name: 'Fashion',
      parentId: 'products-root',
      listingType: null,
      parentListingType: 'product',
      rootListingType: null,
    },
    {
      id: 'mens-clothing',
      name: "Men's Clothing",
      parentId: 'fashion',
      listingType: null,
      parentListingType: null,
      rootListingType: 'product',
    },
  ];
  const pool = {
    async query(sql) {
      if (sql.includes('FROM categories c')) return [categoryRows];
      return [[]];
    },
  };
  const handlers = createRouteHarness(pool);
  const response = createResponse();

  await handlers.get('GET /customer/marketplace/search/filters')(
    { query: { type: 'product' } },
    response,
    (error) => {
      throw error;
    }
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.categories.map(({ id }) => id), ['fashion']);
  assert.deepEqual(response.body.subcategories, [{
    id: 'mens-clothing',
    name: "Men's Clothing",
    categoryId: 'fashion',
  }]);
});

test('Phase 13 search rejects filters that do not apply to the selected section', async () => {
  let queryCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
      return [[]];
    },
  };
  const handlers = createRouteHarness(pool);
  const response = createResponse();

  await handlers.get('GET /customer/marketplace/search')(
    { query: { type: 'service', skill: 'JavaScript' } },
    response,
    (error) => {
      throw error;
    }
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'invalid_filter');
  assert.equal(queryCount, 0);
});

test('Phase 13 search applies category, subcategory and price filters to product discovery', async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 0 }]];
      return [[]];
    },
  };
  const handlers = createRouteHarness(pool);
  const response = createResponse();

  await handlers.get('GET /customer/marketplace/search')(
    {
      query: {
        type: 'product',
        categoryId: 'fashion',
        subcategoryId: 'mens-clothing',
        minPrice: '25',
        maxPrice: '100',
        sort: 'price_asc',
      },
    },
    response,
    (error) => {
      throw error;
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /ml\.category_id = \? OR ml\.subcategory_id = \?/);
  assert.match(queries[0].sql, /ml\.subcategory_id = \?/);
  assert.deepEqual(
    queries[0].params.filter((value) => ['fashion', 'mens-clothing', 25, 100].includes(value)),
    ['fashion', 'fashion', 'mens-clothing', 25, 25, 100, 100]
  );
});
