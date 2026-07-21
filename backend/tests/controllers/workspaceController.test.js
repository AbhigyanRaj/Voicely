import { jest } from '@jest/globals';
import { getWorkspaces, createWorkspace } from '../../src/controllers/workspaceController.js';
import Workspace from '../../src/models/Workspace.js';
import User from '../../src/models/User.js';
import cacheUtils from '../../src/utils/cacheUtils.js';

describe('Workspace Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(cacheUtils, 'getCache').mockResolvedValue(null);
    jest.spyOn(cacheUtils, 'setCache').mockResolvedValue();
  });

  describe('getWorkspaces', () => {
    it('should return paginated workspaces for a user', async () => {
      const req = {
        user: { _id: 'user123' },
        query: { page: '1', limit: '10' }
      };
      
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const mockWorkspaces = [{ name: 'Test WS' }];
      
      const mockFind = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWorkspaces)
      };

      jest.spyOn(Workspace, 'find').mockReturnValue(mockFind);
      jest.spyOn(Workspace, 'countDocuments').mockResolvedValue(1);

      await getWorkspaces(req, res);

      expect(Workspace.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        workspaces: mockWorkspaces,
        pagination: { total: 1, page: 1, limit: 10, pages: 1 }
      });
    });

    it('should handle errors', async () => {
      const req = { user: { _id: 'user123' }, query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      jest.spyOn(Workspace, 'find').mockImplementation(() => {
        throw new Error('DB Error');
      });

      await getWorkspaces(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to fetch workspaces' });
    });
  });
});
