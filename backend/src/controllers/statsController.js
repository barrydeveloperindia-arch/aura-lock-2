const supabase = require('../../supabase');

exports.getStats = async (req, res) => {
    try {
        // ── Timezone-correct "today" date string ─────────────────────────────
        const todayIST = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata'
        }).format(new Date()); 

        // IST midnight as a UTC moment (for access_logs timestamp comparisons)
        const istMidnightUTC = new Date(`${todayIST}T00:00:00+05:30`).toISOString();

        // ── Parallel DB queries ───────────────────────────────────────────────
        const [
            { count: activeEmployeeCount },
            { count: faceCount },
            { count: fingerCount },
            { count: rfidCount },
            { count: todayGranted },
            { data: attendanceToday },
            { count: scansToday }
        ] = await Promise.all([
            supabase.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
            supabase.from('face_encodings').select('id', { count: 'exact', head: true }),
            supabase.from('fingerprints').select('*', { count: 'exact', head: true }),
            supabase.from('rfid_tags').select('*', { count: 'exact', head: true }),
            supabase.from('access_logs').select('*', { count: 'exact', head: true }).eq('status', 'success').gte('created_at', istMidnightUTC),
            supabase.from('attendance').select('employee_id, check_in, status').eq('date', todayIST).not('check_in', 'is', null),
            supabase.from('access_logs').select('*', { count: 'exact', head: true }).gte('created_at', istMidnightUTC)
        ]);

        const totalEmployees = activeEmployeeCount || 0;
        
        const uniquePresentIds = new Set();
        const uniqueLateIds = new Set();
        const LATE_HOUR = 9, LATE_MIN = 15;
        const lateThresholdMins = LATE_HOUR * 60 + LATE_MIN;

        if (attendanceToday) {
            attendanceToday.forEach(a => {
                if (a.employee_id && a.check_in) {
                    uniquePresentIds.add(a.employee_id);
                    const checkInIST = new Date(a.check_in).toLocaleTimeString('en-US', {
                        timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit'
                    });
                    const [h, m] = checkInIST.split(':').map(Number);
                    if ((h * 60 + m) > lateThresholdMins) {
                        uniqueLateIds.add(a.employee_id);
                    }
                }
            });
        }

        const presentToday = uniquePresentIds.size;
        const absentToday = Math.max(0, totalEmployees - presentToday);
        const lateToday = uniqueLateIds.size;

        console.log(`📊 [Stats] todayIST=${todayIST} | employees=${totalEmployees} | present=${presentToday} | late=${lateToday} | scans=${scansToday}`);

        res.json({
            total_employees: totalEmployees,
            present_today: presentToday,
            absent_today: absentToday,
            late_today: lateToday,
            total_scans_today: scansToday || 0,
            totalUsers: totalEmployees,
            faceProfiles: faceCount || 0,
            fingerprints: fingerCount || 0,
            rfidCards: rfidCount || 0,
            todayEntries: todayGranted || 0,
            failedAttempts: 0,
            isPresent: presentToday,
            absentToday,
            lateToday: lateToday,
            trends: {
                users: '+2', faces: '+1', fingerprints: '0', rfid: '+1',
                entries: '+12%', failures: '-5%'
            }
        });
    } catch (error) {
        console.error("❌ Stats error:", error.message || error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
};
