import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { getWorkspaces } from '../../src/controllers/workspaceController.js';
import Workspace from '../../src/models/Workspace.js';
import mongoose from 'mongoose';

const app = express();

const globalUserId = new mongoose.Types.ObjectId();

// Mock authentication middleware
app.use((req, res, next) => {
  req.user = { _id: globalUserId };
  next();
});

app.get('/api/v1/workspaces', getWorkspaces);

describe('Workspace Integration Test', () => {
  beforeEach(async () => {
    await Workspace.deleteMany({});
  });

  it('GET /api/v1/workspaces should return workspaces', async () => {
    // Insert a test workspace directly into the in-memory MongoDB
    await Workspace.create({
      name: 'Integration Test WS',
      userId: globalUserId,
      category: 'real_estate'
    });

    const response = await request(app).get('/api/v1/workspaces');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.workspaces.length).toBe(1);
    expect(response.body.workspaces[0].name).toBe('Integration Test WS');
    expect(response.body.pagination.total).toBe(1);
  });
});
