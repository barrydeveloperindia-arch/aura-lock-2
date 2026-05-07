const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set env var before requiring server
process.env.JWT_SECRET = 'test_secret_123';

// Mock the supabase instance directly
jest.mock('../supabase', () => {
    const mockSingle = jest.fn();
    const mockSelect = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockReturnThis();
    const mockUpsert = jest.fn().mockReturnThis();
    const mockInsert = jest.fn().mockReturnThis();

    return {
        from: jest.fn(() => ({
            select: mockSelect,
            eq: mockEq,
            single: mockSingle,
            upsert: mockUpsert,
            insert: mockInsert
        }))
    };
});

const supabase = require('../supabase');
const app = require('../server');

describe('Employee Registration API', () => {
    let adminToken;

    beforeAll(() => {
        // Generate a mock JWT for the admin
        adminToken = jwt.sign(
            { role: 'admin', email: '5089shivkumar@gmail.com' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully register a new employee (No Biometrics)', async () => {
        // 1. Mock validateIdentity queries to return null (meaning no duplicate found)
        // 2. Mock the final upsert query
        supabase.from().single.mockResolvedValueOnce({ data: null }); // check Employee ID Uniqueness
        supabase.from().single.mockResolvedValueOnce({ data: null }); // check Name Uniqueness
        supabase.from().single.mockResolvedValueOnce({ data: null }); // check Face Biometric Uniqueness
        
        // Mock the upsert -> select -> single chain
        supabase.from().single.mockResolvedValueOnce({
            data: {
                id: 'uuid-1234',
                employee_id: 'E100',
                name: 'Test Employee',
                email: 'test@example.com',
                role: 'employee',
                department: 'Engineering'
            },
            error: null
        });

        const res = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                employee_id: 'E100',
                name: 'Test Employee',
                email: 'test@example.com',
                role: 'employee',
                department: 'Engineering'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('employee_id', 'E100');
        expect(res.body).toHaveProperty('name', 'Test Employee');
    });

    it('should return 400 if required fields are missing', async () => {
        const res = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Incomplete Employee'
                // missing employee_id
            });

        // The middleware `validateIdentity` will pass if it finds no duplicates, 
        // but `server.js` should catch DB errors if not valid.
        // Wait, does server.js validate the fields? Or does it just upsert and fail at DB level?
        // If it fails at DB level, we mock the upsert to return an error.
        supabase.from().single.mockResolvedValueOnce({ data: null }); // duplicate check 1
        supabase.from().single.mockResolvedValueOnce({ data: null }); // duplicate check 2
        supabase.from().single.mockResolvedValueOnce({ data: null }); // duplicate check 3
        
        supabase.from().single.mockResolvedValueOnce({
            data: null,
            error: { message: 'Missing required field: employee_id' }
        });

        const res2 = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Incomplete Employee'
            });

        expect(res2.statusCode).toBe(400); 
    });
});
