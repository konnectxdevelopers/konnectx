import test from 'node:test';
import assert from 'node:assert/strict';
import { registerProjectsProposalsRoutes } from '../src/projects-proposals-routes.js';

const config = {
  uploadUrlTtlSeconds: 300,
  moderation: { requireReviewTypes: [] },
  marketplace: { businessProjectProposalsEnabled: false },
  b2: {},
};

function createRouteCaller(pool, routeConfig = config) {
  const handlers = new Map();
  const router = {};
  for (const method of ['get', 'post', 'put', 'patch']) {
    router[method] = (path, ...callbacks) => handlers.set(`${method.toUpperCase()} ${path}`, callbacks);
  }
  const authenticate = (req, res, next) => next();
  registerProjectsProposalsRoutes(router, { pool, config: routeConfig, authenticate });

  return async (method, path, req = {}) => {
    const callbacks = handlers.get(`${method.toUpperCase()} ${path}`);
    assert.ok(callbacks, `Expected route ${method.toUpperCase()} ${path}`);
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const next = (error) => {
      if (error) throw error;
    };
    await callbacks[callbacks.length - 1](
      { headers: {}, query: {}, params: {}, body: {}, ...req },
      res,
      next
    );
    return res;
  };
}

function transactionConnection(runQuery) {
  return {
    query: runQuery,
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
}

function createProjectPool({ roles = ['hiring'], hiringEnabled = true } = {}) {
  const writes = [];
  let projectRow = null;
  const runQuery = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    writes.push({ sql: normalized, params });
    if (normalized.startsWith('INSERT INTO freelance_projects')) {
      projectRow = {
        id: params[0],
        client_user_id: params[1],
        client_role: params[2],
        category_id: params[3],
        subcategory_id: params[4],
        title: params[5],
        description: params[6],
        deliverables: params[7],
        budget_type: params[8],
        budget: params[9],
        budget_min: params[10],
        budget_max: params[11],
        currency: params[12],
        required_skills: params[13],
        work_mode: params[14],
        location: params[15],
        experience_level: params[16],
        deadline: params[17],
        proposal_deadline: params[18],
        screening_questions: params[19],
        visibility: params[20],
        is_active: params[21],
        status: params[22],
      };
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  };

  const pool = {
    writes,
    async getConnection() {
      return transactionConnection(runQuery);
    },
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      writes.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT role FROM user_roles')) {
        return [roles.map((role) => ({ role }))];
      }
      if (normalized.startsWith('SELECT hiring_enabled FROM business_profiles')) {
        return [[{ hiring_enabled: hiringEnabled ? 1 : 0 }]];
      }
      if (normalized.startsWith('SELECT setting_value FROM marketplace_settings')) return [[]];
      if (normalized.startsWith('SELECT c.id FROM categories c')) return [[{ id: 'project-category' }]];
      if (normalized.startsWith('SELECT p.*, u.name AS client_name FROM freelance_projects p')) {
        return [[{ ...projectRow, client_name: 'Project Owner' }]];
      }
      if (normalized.startsWith('SELECT project_id, skill FROM project_skills')) return [[]];
      if (normalized.startsWith('SELECT id, project_id, file_name, mime_type, file_size FROM project_attachments')) return [[]];
      if (normalized.startsWith('SELECT id, name FROM categories')) {
        return [[{ id: 'project-category', name: 'Design' }]];
      }
      throw new Error(`Unexpected project test query: ${normalized}`);
    },
  };
  return pool;
}

test('Phase 11 allows hiring project posting and persists a published project listing', async () => {
  const pool = createProjectPool();
  const call = createRouteCaller(pool);
  const response = await call('post', '/marketplace/projects', {
    auth: { userId: 'hiring-owner' },
    body: {
      action: 'publish',
      title: 'Build a mobile prototype',
      categoryId: 'project-category',
      description: 'Create a clickable prototype for a new mobile app.',
      budgetType: 'fixed',
      budget: 1200,
      currency: 'INR',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.project.status, 'published');
  assert.equal(response.body.project.listingType, 'freelance_project');
  assert.ok(pool.writes.some(({ sql }) => sql.startsWith('INSERT INTO freelance_projects')));
  assert.ok(pool.writes.some(({ sql, params }) =>
    sql.startsWith('INSERT INTO marketplace_listings') && params[1] === 'freelance_project'
  ));
});

test('Phase 11 blocks Customer and Professional project posting roles', async () => {
  for (const role of ['customer', 'professional']) {
    const pool = createProjectPool({ roles: [role] });
    const call = createRouteCaller(pool);
    const response = await call('post', '/marketplace/projects', {
      auth: { userId: 'unauthorized-poster' },
      body: { action: 'save_draft', title: 'Not allowed' },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'forbidden_role');
    assert.equal(pool.writes.some(({ sql }) => sql.startsWith('INSERT INTO freelance_projects')), false);
  }
});

test('Phase 11 public discovery limits results to published open public projects', async () => {
  const queries = [];
  const pool = {
    async query(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (normalized.startsWith('SELECT COUNT(*) AS total FROM freelance_projects')) return [[{ total: 0 }]];
      if (normalized.startsWith('SELECT p.*, u.name AS client_name')) return [[]];
      throw new Error(`Unexpected project discovery query: ${normalized}`);
    },
  };
  const call = createRouteCaller(pool);
  const response = await call('get', '/marketplace/projects');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.pagination.total, 0);
  assert.match(queries[0], /p\.status = 'published'/);
  assert.match(queries[0], /p\.is_active = TRUE/);
  assert.match(queries[0], /p\.visibility = 'public'/);
  assert.match(queries[0], /p\.proposal_deadline IS NULL OR p\.proposal_deadline >= CURDATE\(\)/);
});

test('Phase 11 business project posting requires the explicit hiring capability', async () => {
  const disabledCall = createRouteCaller(createProjectPool({ roles: ['business'], hiringEnabled: false }));
  const denied = await disabledCall('post', '/marketplace/projects', {
    auth: { userId: 'business-owner' },
    body: { action: 'save_draft', clientRole: 'business', title: 'Business project' },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.code, 'hiring_capability_disabled');

  const enabledCall = createRouteCaller(createProjectPool({ roles: ['business'], hiringEnabled: true }));
  const allowed = await enabledCall('post', '/marketplace/projects', {
    auth: { userId: 'business-owner' },
    body: { action: 'save_draft', clientRole: 'business', title: 'Business project' },
  });
  assert.equal(allowed.statusCode, 201);
  assert.equal(allowed.body.project.clientRole, 'business');
});

function createProposalPool({ projectStatus = 'published', duplicate = false, roles = ['professional'] } = {}) {
  const writes = [];
  const project = {
    id: 'project-1',
    client_user_id: 'owner-1',
    status: projectStatus,
    is_active: 1,
    proposal_deadline: null,
    listing_status: projectStatus,
    currency: 'INR',
  };
  const runQuery = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    writes.push({ sql: normalized, params });
    if (normalized.startsWith('SELECT p.client_user_id, p.status, p.is_active, p.proposal_deadline')) {
      return [[{ ...project }]];
    }
    if (normalized.startsWith('SELECT id FROM project_proposals') &&
        normalized.includes('WHERE project_id = ? AND proposer_user_id = ?')) {
      return [duplicate ? [{ id: 'existing-proposal' }] : []];
    }
    return [{ affectedRows: 1 }];
  };
  const pool = {
    writes,
    async getConnection() {
      return transactionConnection(runQuery);
    },
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      writes.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT role FROM user_roles')) return [roles.map((role) => ({ role }))];
      if (normalized.startsWith('SELECT p.*, ml.status AS listing_status')) return [[{ ...project }]];
      if (normalized.startsWith('SELECT id FROM project_proposals') &&
          normalized.includes('WHERE project_id = ? AND proposer_user_id = ?')) {
        return [duplicate ? [{ id: 'existing-proposal' }] : []];
      }
      if (normalized.startsWith('SELECT id, object_key, content_type, byte_size FROM media_assets')) return [[]];
      throw new Error(`Unexpected proposal test query: ${normalized}`);
    },
  };
  return pool;
}

test('Phase 11 professionals can submit proposals with milestones and status history', async () => {
  const pool = createProposalPool();
  const call = createRouteCaller(pool);
  const response = await call('post', '/marketplace/projects/:id/proposals', {
    auth: { userId: 'professional-1' },
    params: { id: 'project-1' },
    body: {
      coverMessage: 'I can deliver this prototype.',
      proposedAmount: 1000,
      portfolioLinks: ['https://portfolio.example.test/work'],
      milestones: [{ title: 'Prototype', estimatedDays: 5 }],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.proposal.status, 'submitted');
  assert.ok(pool.writes.some(({ sql }) => sql.startsWith('INSERT INTO project_proposals')));
  assert.ok(pool.writes.some(({ sql }) => sql.startsWith('INSERT INTO proposal_milestones')));
  assert.ok(pool.writes.some(({ sql }) => sql.startsWith('INSERT INTO proposal_status_history')));
});

test('Phase 11 blocks duplicate proposals and proposals to closed projects', async () => {
  const duplicateCall = createRouteCaller(createProposalPool({ duplicate: true }));
  const duplicateResponse = await duplicateCall('post', '/marketplace/projects/:id/proposals', {
    auth: { userId: 'professional-1' },
    params: { id: 'project-1' },
    body: { coverMessage: 'Duplicate proposal' },
  });
  assert.equal(duplicateResponse.statusCode, 409);
  assert.equal(duplicateResponse.body.code, 'duplicate_proposal');

  const closedCall = createRouteCaller(createProposalPool({ projectStatus: 'awarded' }));
  const closedResponse = await closedCall('post', '/marketplace/projects/:id/proposals', {
    auth: { userId: 'professional-1' },
    params: { id: 'project-1' },
    body: { coverMessage: 'Too late' },
  });
  assert.equal(closedResponse.statusCode, 409);
  assert.equal(closedResponse.body.code, 'project_not_open');
});

test('Phase 11 business proposals are disabled unless explicitly enabled', async () => {
  const pool = createProposalPool({ roles: ['business'] });
  const disabledCall = createRouteCaller(pool);
  const denied = await disabledCall('post', '/marketplace/projects/:id/proposals', {
    auth: { userId: 'business-provider' },
    params: { id: 'project-1' },
    body: { coverMessage: 'Business proposal' },
  });
  assert.equal(denied.statusCode, 403);

  const enabledCall = createRouteCaller(pool, {
    ...config,
    marketplace: { businessProjectProposalsEnabled: true },
  });
  const allowed = await enabledCall('post', '/marketplace/projects/:id/proposals', {
    auth: { userId: 'business-provider' },
    params: { id: 'project-1' },
    body: { coverMessage: 'Business proposal' },
  });
  assert.equal(allowed.statusCode, 201);
});

test('Phase 11 owner proposal queries are scoped to owned projects', async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT role FROM user_roles')) return [[{ role: 'hiring' }]];
      if (normalized.startsWith('SELECT pp.*, p.title AS project_title')) return [[]];
      if (normalized.startsWith('SELECT COUNT(*) AS total')) return [[{ total: 0 }]];
      throw new Error(`Unexpected owner proposal test query: ${normalized}`);
    },
  };
  const call = createRouteCaller(pool);
  const response = await call('get', '/marketplace/owner/proposals', {
    auth: { userId: 'owner-1' },
  });

  assert.equal(response.statusCode, 200);
  const query = queries.find(({ sql }) => sql.startsWith('SELECT pp.*, p.title AS project_title'));
  assert.match(query.sql, /WHERE p\.client_user_id = \?/);
  assert.equal(query.params[0], 'owner-1');
});

test('Phase 11 owner proposal updates change status and append status history', async () => {
  const writes = [];
  const pool = {
    async getConnection() {
      return transactionConnection(async (sql, params = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        writes.push({ sql: normalized, params });
        if (normalized.startsWith('SELECT id FROM project_proposals') &&
            normalized.includes("status = 'selected'")) return [[]];
        return [{ affectedRows: 1 }];
      });
    },
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      writes.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT role FROM user_roles')) return [[{ role: 'hiring' }]];
      if (normalized.startsWith('SELECT pp.*, p.client_user_id')) {
        return [[{
          id: 'proposal-1',
          project_id: 'project-1',
          proposer_user_id: 'professional-1',
          client_user_id: 'owner-1',
          status: 'submitted',
          internal_notes: null,
        }]];
      }
      throw new Error(`Unexpected proposal status test query: ${normalized}`);
    },
  };
  const call = createRouteCaller(pool);
  const response = await call('patch', '/marketplace/proposals/:id', {
    auth: { userId: 'owner-1' },
    params: { id: 'proposal-1' },
    body: { status: 'shortlisted', internalNotes: 'Strong portfolio.' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.proposal.status, 'shortlisted');
  assert.ok(writes.some(({ sql }) => sql.startsWith('UPDATE project_proposals')));
  assert.ok(writes.some(({ sql }) => sql.startsWith('INSERT INTO proposal_status_history')));
});
