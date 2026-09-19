jest.mock('./mailer', () => ({ config: jest.fn(() => ({ configured: true })), sendMail: jest.fn(async () => ({})) }));
const mailer = require('./mailer');
const { canNotify, emailStaff } = require('./notify');

describe('notify.emailApprovers', () => {
    const { approverEmails, emailApprovers } = require('./notify');
    const msg = { subject: 's', text: 't', html: 'h' };
    beforeEach(() => { mailer.sendMail.mockClear(); mailer.config.mockReturnValue({ configured: true }); delete process.env.ALERT_LEAVE_APPROVERS; });
    afterAll(() => { delete process.env.ALERT_LEAVE_APPROVERS; });

    test('sends one email to every valid approver address', async () => {
        process.env.ALERT_LEAVE_APPROVERS = 'a@x.com, b@y.com ,not-an-email';
        expect(approverEmails()).toEqual(['a@x.com', 'b@y.com']);
        expect(await emailApprovers(msg)).toBe(true);
        expect(mailer.sendMail).toHaveBeenCalledWith({ ...msg, to: ['a@x.com', 'b@y.com'] });
    });
    test('nobody is emailed when no approvers are configured', async () => {
        expect(await emailApprovers(msg)).toBe(false);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });
});

describe('notify.emailStaff', () => {
    beforeEach(() => { mailer.sendMail.mockClear(); mailer.config.mockReturnValue({ configured: true }); });
    const msg = { subject: 's', text: 't', html: 'h' };

    test('sends to the person only when the switch is on and the address is valid', async () => {
        expect(await emailStaff({ email: 'a@b.com', notify_email: true }, msg)).toBe(true);
        expect(mailer.sendMail).toHaveBeenCalledWith({ ...msg, to: 'a@b.com' });
    });
    test('never emails when the switch is off, missing, or the address is bad', async () => {
        expect(canNotify({ email: 'a@b.com', notify_email: false })).toBe(false);
        expect(canNotify({ email: 'a@b.com' })).toBe(false);
        expect(canNotify({ email: 'nope', notify_email: true })).toBe(false);
        expect(await emailStaff({ email: 'a@b.com', notify_email: false }, msg)).toBe(false);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });
    test('a guest is never emailed, even if the switch is on', async () => {
        expect(canNotify({ email: 'a@b.com', notify_email: true, department: 'Guest' })).toBe(false);
        expect(await emailStaff({ email: 'a@b.com', notify_email: true, department: 'Guest' }, msg)).toBe(false);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });
    test('the CEO is never emailed automatically, even if the switch is on', async () => {
        expect(canNotify({ email: 'a@b.com', notify_email: true, department: 'CEO' })).toBe(false);
        expect(await emailStaff({ email: 'a@b.com', notify_email: true, department: 'CEO' }, msg)).toBe(false);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });
    test('a CEO by designation is never emailed even if the department differs', () => {
        expect(canNotify({ email: 'a@b.com', notify_email: true, department: 'Management', designation: 'CEO' })).toBe(false);
    });
    test('does nothing (and does not throw) when email is not configured', async () => {
        mailer.config.mockReturnValue({ configured: false });
        expect(await emailStaff({ email: 'a@b.com', notify_email: true }, msg)).toBe(false);
    });
    test('a mail failure returns false instead of throwing', async () => {
        mailer.sendMail.mockRejectedValueOnce(new Error('smtp down'));
        expect(await emailStaff({ email: 'a@b.com', notify_email: true }, msg)).toBe(false);
    });
});
