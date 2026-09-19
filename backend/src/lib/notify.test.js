jest.mock('./mailer', () => ({ config: jest.fn(() => ({ configured: true })), sendMail: jest.fn(async () => ({})) }));
const mailer = require('./mailer');
const { canNotify, emailStaff } = require('./notify');

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
    test('does nothing (and does not throw) when email is not configured', async () => {
        mailer.config.mockReturnValue({ configured: false });
        expect(await emailStaff({ email: 'a@b.com', notify_email: true }, msg)).toBe(false);
    });
    test('a mail failure returns false instead of throwing', async () => {
        mailer.sendMail.mockRejectedValueOnce(new Error('smtp down'));
        expect(await emailStaff({ email: 'a@b.com', notify_email: true }, msg)).toBe(false);
    });
});
