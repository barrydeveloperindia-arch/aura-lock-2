const fs = require('fs');
let code = fs.readFileSync('c:/Users/Englabs/.gemini/antigravity/scratch/Aura Lock 2/backend/server.js', 'utf8');

const newFunc = `async function handlePdfExport(req, res) {
    try {
        const { month, year, department, startDate: sd, endDate: ed } = req.query;
        const employee_id = req.query.employee_id || req.params.employee_id;
        const now = new Date();

        let fromDate, toDate;
        if (month && year) {
            fromDate = \`\${year}-\${String(month).padStart(2, '0')}-01\`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            toDate = \`\${year}-\${String(month).padStart(2, '0')}-\${String(lastDay).padStart(2, '0')}\`;
        } else {
            fromDate = sd || now.toISOString().split('T')[0];
            toDate = ed || now.toISOString().split('T')[0];
        }

        let q = supabase
            .from('attendance')
            .select('*, employees!inner(name, employee_id, department)')
            .gte('date', fromDate)
            .lte('date', toDate)
            .order('date', { ascending: false });

        if (employee_id) q = q.eq('employees.employee_id', employee_id);
        if (department) q = q.eq('employees.department', department);
        if (req.query.search) q = q.ilike('employees.name', \`%\${req.query.search}%\`);
        if (req.query.status) q = q.eq('status', req.query.status);

        const { data: records, error } = await q;
        if (error) throw error;

        let empDetails = null;
        if (employee_id) {
             const { data: empData } = await supabase.from('employees').select('*').eq('employee_id', employee_id).single();
             empDetails = empData;
        } else if (records && records.length > 0) {
             empDetails = records[0].employees;
        }

        const dedupMap = new Map();
        for (const row of (records || [])) {
            const key = row.employees?.employee_id + '_' + row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        const deduplicatedRecords = Array.from(dedupMap.values());

        let totalDays = deduplicatedRecords.length; 
        let presentCount = deduplicatedRecords.filter(r => r.status === 'ON_TIME' || r.status === 'LATE').length;
        let lateCount = deduplicatedRecords.filter(r => r.status === 'LATE').length;
        let absentCount = deduplicatedRecords.filter(r => r.status === 'ABSENT' || !r.check_in).length;
        
        let totalMinutes = 0;
        let totalOvertimeMins = 0;

        deduplicatedRecords.forEach(r => {
             let workMins = 0;
             if (r.working_hours != null) workMins = r.working_hours * 60;
             else if (r.check_in && r.check_out) workMins = (new Date(r.check_out) - new Date(r.check_in)) / 60000;
             
             totalMinutes += workMins;
             if (workMins > 540) {
                 totalOvertimeMins += (workMins - 540);
             }
        });

        const formatHrs = mins => \`\${Math.floor(mins/60)}h \${Math.round(mins%60)}m\`;
        const totalHrsStr = formatHrs(totalMinutes);
        const totalOTStr = formatHrs(totalOvertimeMins);
        
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 40, autoFirstPage: true });

        const filename = \`attendance_\${fromDate}_to_\${toDate}.pdf\`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', \`attachment; filename="\${filename}"\`);
        doc.pipe(res);
        
        const C = {
            navy: [15, 23, 42], slate: [30, 41, 59], mid: [100, 116, 139],
            emerald: [16, 185, 129], amber: [245, 158, 11], red: [239, 68, 68],
            blue: [59, 130, 246], bgLight: [248, 250, 252], border: [226, 232, 240], white: [255, 255, 255]
        };

        const W = doc.page.width - 80;
        let curY = 40;

        doc.roundedRect(40, curY, 32, 32, 8).fill(C.emerald);
        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(18).text('A', 40, curY + 8, { width: 32, align: 'center' });
        
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(22).text('AuraLock', 82, curY + 2);
        doc.fillColor(C.slate).font('Helvetica').fontSize(8).text('SMART BIOMETRIC ACCESS CONTROL', 82, curY + 24);

        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(14).text('ATTENDANCE REPORT', 40, curY + 4, { align: 'right', width: W });
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
        doc.text(\`Report Generated On  :   \${now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })}\`, 40, curY + 22, { align: 'right', width: W });
        doc.text(\`Report Period              :   \${fromDate} - \${toDate}\`, 40, curY + 34, { align: 'right', width: W });
        doc.text(\`Department                 :   \${department || 'All Departments'}\`, 40, curY + 46, { align: 'right', width: W });
        
        curY += 60;
        doc.moveTo(40, curY).lineTo(40 + W, curY).lineWidth(1).strokeColor(C.border).stroke();
        curY += 20;

        if (empDetails) {
            doc.roundedRect(40, curY, W, 70, 8).fill(C.bgLight);
            doc.circle(75, curY + 35, 20).fill(C.mid);
            doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16).text(empDetails.name ? empDetails.name.charAt(0).toUpperCase() : 'E', 55, curY + 28, { width: 40, align: 'center' });
            
            doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(14).text(empDetails.name || 'Unknown Employee', 105, curY + 15);
            
            doc.roundedRect(250, curY + 15, 50, 14, 4).fill([220, 252, 231]);
            doc.fillColor([22, 163, 74]).font('Helvetica-Bold').fontSize(8).text(empDetails.employee_id || 'EMP-001', 250, curY + 19, { width: 50, align: 'center' });

            doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
            doc.text(\`Department    :  \${empDetails.department || 'General'}\`, 105, curY + 35);
            doc.text(\`Designation    :  Software Developer\`, 105, curY + 47);
            doc.text(\`Email              :  \${(empDetails.name || 'employee').toLowerCase().replace(' ', '.')}@auralock.com\`, 250, curY + 35);
            curY += 90;
        }

        const pW = (W - 50) / 6;
        const pills = [
            { label: 'TOTAL DAYS', val: totalDays, c: C.blue, bg: [239, 246, 255] },
            { label: 'PRESENT', val: presentCount, c: C.emerald, bg: [236, 253, 245] },
            { label: 'ABSENT', val: absentCount, c: C.red, bg: [254, 242, 242] },
            { label: 'LATE', val: lateCount, c: C.amber, bg: [255, 251, 235] },
            { label: 'TOTAL HOURS WORKED', val: totalHrsStr, c: C.blue, bg: [248, 250, 252], w2: 2 },
            { label: 'TOTAL OVERTIME', val: totalOTStr, c: C.navy, bg: [248, 250, 252], w2: 2 },
        ];

        let pX = 40;
        pills.forEach(p => {
            const w = p.w2 ? (pW * 1.5 + 5) : pW;
            doc.roundedRect(pX, curY, w, 60, 6).fill(p.bg);
            doc.fillColor(p.c).font('Helvetica-Bold').fontSize(p.w2 ? 14 : 18).text(String(p.val), pX, curY + 25, { width: w, align: 'center' });
            doc.fillColor(C.mid).font('Helvetica-Bold').fontSize(6).text(p.label, pX, curY + 10, { width: w, align: 'center' });
            pX += w + 10;
        });

        curY += 80;

        const COLS = [
            { l: '#', w: 20 }, { l: 'DATE', w: 60 }, { l: 'DAY', w: 30 }, { l: 'CHECK IN', w: 50 },
            { l: 'CHECK OUT', w: 50 }, { l: 'TOTAL HRS', w: 55 }, { l: 'STATUS', w: 55 }, 
            { l: 'OVERTIME', w: 55 }, { l: 'METHOD', w: 45 }, { l: 'REMARKS', w: W - 420 }
        ];

        doc.rect(40, curY, W, 20).fill(C.navy);
        let cx = 40;
        COLS.forEach(c => {
            doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7).text(c.l, cx + 2, curY + 6, { width: c.w - 4, align: 'center' });
            cx += c.w;
        });
        curY += 20;

        const checkBreak = (h) => {
            if (curY + h > doc.page.height - 60) {
                doc.addPage();
                curY = 40;
                doc.rect(40, curY, W, 20).fill(C.navy);
                cx = 40;
                COLS.forEach(c => {
                    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7).text(c.l, cx + 2, curY + 6, { width: c.w - 4, align: 'center' });
                    cx += c.w;
                });
                curY += 20;
            }
        };

        const fmtT = iso => {
            if(!iso) return '—';
            const dt = new Date(iso);
            return dt.toLocaleTimeString('en-US', {hour12:true, hour:'2-digit', minute:'2-digit'});
        };
        
        deduplicatedRecords.forEach((r, i) => {
            checkBreak(20);
            doc.rect(40, curY, W, 20).fill(i % 2 === 0 ? C.white : C.bgLight);
            
            let wM = 0;
            if (r.working_hours != null) wM = r.working_hours * 60;
            else if (r.check_in && r.check_out) wM = (new Date(r.check_out) - new Date(r.check_in)) / 60000;
            
            let otStr = '—';
            if (wM > 540) otStr = \`\${Math.floor((wM - 540)/60)}h \${Math.round((wM - 540)%60)}m\`;
            
            let statusLabel = 'Absent';
            if (r.status === 'LATE') statusLabel = 'Late';
            if (r.status === 'ON_TIME') statusLabel = 'Present';

            const vals = [
                String(i + 1),
                r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
                r.date ? new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short' }) : '—',
                fmtT(r.check_in),
                fmtT(r.check_out),
                formatHrs(wM),
                statusLabel,
                otStr,
                r.method ? (r.method.charAt(0).toUpperCase() + r.method.slice(1)) : '—',
                '—'
            ];

            cx = 40;
            vals.forEach((v, ci) => {
                if (ci === 6) {
                    let bColor = C.red; let tColor = C.white; let bgC = [254, 226, 226];
                    if (v === 'Present') { bColor = [22, 163, 74]; tColor = [20, 83, 45]; bgC = [220, 252, 231]; }
                    if (v === 'Late') { bColor = [217, 119, 6]; tColor = [146, 64, 14]; bgC = [254, 243, 199]; }
                    doc.roundedRect(cx + 8, curY + 3, COLS[ci].w - 16, 14, 4).fill(bgC);
                    doc.fillColor(tColor).font('Helvetica-Bold').fontSize(7).text(v, cx + 8, curY + 7, { width: COLS[ci].w - 16, align: 'center' });
                } else {
                    doc.fillColor(C.slate).font('Helvetica').fontSize(7).text(v, cx + 2, curY + 6, { width: COLS[ci].w - 4, align: 'center' });
                }
                cx += COLS[ci].w;
            });
            curY += 20;
        });

        curY += 20;
        checkBreak(100);
        
        doc.roundedRect(40, curY, W, 80, 8).strokeColor(C.border).lineWidth(1).stroke();
        doc.roundedRect(40, curY - 10, 100, 20, 4).fill(C.navy);
        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8).text('FINAL SUMMARY', 40, curY - 4, { width: 100, align: 'center' });
        
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(16);
        doc.text(String(totalDays), 60, curY + 35);
        doc.text(String(presentCount), 130, curY + 35);
        doc.text(String(absentCount), 220, curY + 35);
        doc.text(String(lateCount), 300, curY + 35);

        doc.fillColor(C.mid).font('Helvetica-Bold').fontSize(7);
        doc.text('Total Days', 60, curY + 25);
        doc.text('Present Days', 130, curY + 25);
        doc.text('Absent Days', 220, curY + 25);
        doc.text('Late Days', 300, curY + 25);
        
        doc.moveTo(360, curY + 15).lineTo(360, curY + 65).strokeColor(C.border).stroke();

        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
        doc.text(\`Total Hours Worked    :    \${totalHrsStr}\`, 380, curY + 20);
        doc.text(\`Total Overtime           :    \${totalOTStr}\`, 380, curY + 35);
        const avgMins = presentCount > 0 ? totalMinutes / presentCount : 0;
        doc.text(\`Average Daily Hours  :    \${formatHrs(avgMins)}\`, 380, curY + 50);
        
        const perc = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;
        doc.circle(W - 10, curY + 40, 25).lineWidth(6).strokeColor(C.border).stroke();
        doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(14).text(\`\${perc}%\`, W - 35, curY + 35, { width: 50, align: 'center' });

        curY += 120;
        checkBreak(100);
        
        doc.moveTo(100, curY).lineTo(250, curY).strokeColor(C.mid).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('Admin User', 100, curY + 10, { width: 150, align: 'center' });
        doc.fillColor(C.mid).font('Helvetica').fontSize(7).text('AuraLock System', 100, curY + 22, { width: 150, align: 'center' });

        doc.circle(W / 2 + 40, curY - 10, 25).strokeColor(C.navy).lineWidth(1).stroke();
        doc.circle(W / 2 + 40, curY - 10, 22).strokeColor(C.navy).lineWidth(0.5).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(6).text('VERIFIED', W / 2 + 15, curY, { width: 50, align: 'center' });

        doc.moveTo(W - 100, curY).lineTo(W + 20, curY).strokeColor(C.mid).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('Authorized Signature', W - 100, curY + 10, { width: 120, align: 'center' });
        doc.fillColor(C.mid).font('Helvetica').fontSize(7).text('(Company Authority)', W - 100, curY + 22, { width: 120, align: 'center' });

        doc.fillColor(C.mid).font('Helvetica').fontSize(7);
        doc.text('This is a system generated report. The information provided in this report is accurate as per the records available in the AuraLock system.', 40, doc.page.height - 40, { width: W - 100 });
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('AuraLock Smart Biometric Access Control', 40, doc.page.height - 40, { align: 'right', width: W });
        doc.fillColor(C.emerald).font('Helvetica').fontSize(7).text('www.auralock.com', 40, doc.page.height - 28, { align: 'right', width: W });

        doc.end();

    } catch (error) {
        console.error('❌ PDF export error:', error);
        if (!res.headersSent)
            res.status(500).json({ error: 'PDF export failed', details: error.message });
    }
}
`;

const regex = /async function handlePdfExport\(req, res\) \{[\s\S]*?\n\}/;
if (regex.test(code)) {
    code = code.replace(regex, newFunc);
    fs.writeFileSync('c:/Users/Englabs/.gemini/antigravity/scratch/Aura Lock 2/backend/server.js', code, 'utf8');
    console.log('Successfully replaced handlePdfExport');
} else {
    console.log('Could not find handlePdfExport');
}
