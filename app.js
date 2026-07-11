(function(){
  "use strict";

  /* 
     ========================================================================
     SUPABASE CONFIGURATION
     ------------------------------------------------------------------------
     To connect this app to your cloud database:
     1. Create a project at https://supabase.com (it's 100% free).
     2. Open the SQL Editor in Supabase, copy the contents of "supabase_schema.sql"
        from this project directory, and run the script to build the tables.
     3. Copy your project's URL and API Anon Key from Project Settings > API.
     4. Paste them into the SUPABASE_URL and SUPABASE_KEY constants below.
     
     If left empty, the app will automatically run in "Local Database Mode" 
     using the browser's localStorage, remaining 100% functional.
     ========================================================================
  */
const SUPABASE_URL = "https://zyrtfpejwwbbkqvtthwp.supabase.co"; 
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5cnRmcGVqd3diYmtxdnR0aHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NjgyNTgsImV4cCI6MjA5OTA0NDI1OH0.bWO78RZ8AFSyxfA1b2dmiPx1QboYxIoU-_uFuQzJnkA";
  /* ============ DATABASE & STATE ============ */
  let db = null;
  let currentUser = null;
  let items = [];
  let log = [];
  let certifiedDesignations = [];
  let availableCompanies = [];
  let currentView = 'dashboard';
  let searchQuery = '';
  let statusFilter = 'all';
  let categoryFilter = 'all';
  let html5QrInstance = null;
  let dataLoaded = false;
  
  let authViewState = 'login';
  let signupStep = 1;
  let signupData = {};
  let tempSignup = null;
  let simulatedOtp = '';

  const CATEGORIES = ['Laptops & Computers', 'Smartphones & Tablets', 'Networking Hardware', 'Monitors & Displays', 'Printers & Scanners', 'AV Equipment', 'Lab Electronics', 'Other Devices'];
  const DEFAULT_CERTIFIED = ["HOD", "CEO", "CFO", "COO", "Chairperson", "President", "Director", "VP"];

  const COUNTRIES = [
    { name: 'India (+91)', code: '+91', digits: [10], placeholder: '98765 43210' },
    { name: 'United States / Canada (+1)', code: '+1', digits: [10], placeholder: '201 555 0123' },
    { name: 'United Kingdom (+44)', code: '+44', digits: [10], placeholder: '7700 900077' },
    { name: 'Australia (+61)', code: '+61', digits: [9], placeholder: '412 345 678' },
    { name: 'Germany (+49)', code: '+49', digits: [10, 11], placeholder: '151 23456789' },
    { name: 'France (+33)', code: '+33', digits: [9], placeholder: '6 1234 5678' },
    { name: 'Singapore (+65)', code: '+65', digits: [8], placeholder: '8123 4567' },
    { name: 'United Arab Emirates (+971)', code: '+971', digits: [9], placeholder: '50 123 4567' },
    { name: 'Saudi Arabia (+966)', code: '+966', digits: [9], placeholder: '50 123 4567' },
    { name: 'Japan (+81)', code: '+81', digits: [10], placeholder: '90 1234 5678' }
  ];

  function isValidEmail(email) {
    if (!email) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function cleanPhoneDigits(str) {
    return str.replace(/\D/g, '');
  }

  function validatePhone(numberStr, countryCode) {
    const cleaned = cleanPhoneDigits(numberStr);
    const country = COUNTRIES.find(c => c.code === countryCode);
    if (!country) return { valid: false, message: 'Invalid country code selected.' };
    
    const isValid = country.digits.includes(cleaned.length);
    if (!isValid) {
      const expected = country.digits.join(' or ');
      return { 
        valid: false, 
        message: `Phone number must be exactly ${expected} digits for ${country.name.split(' (')[0]}.`
      };
    }
    return { valid: true, cleaned };
  }

  function parsePhoneAndCountry(fullPhone) {
    if (!fullPhone) return { countryCode: '+91', localNumber: '' };
    const sortedCountries = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sortedCountries) {
      if (fullPhone.startsWith(c.code)) {
        return { countryCode: c.code, localNumber: fullPhone.substring(c.code.length) };
      }
    }
    if (fullPhone.startsWith('+')) {
      const match = fullPhone.match(/^\+\d+/);
      if (match) {
        return { countryCode: match[0], localNumber: fullPhone.substring(match[0].length) };
      }
    }
    return { countryCode: '+91', localNumber: fullPhone };
  }

  const DEFAULT_COMPANIES = {
    "Google": {
      name: "Google",
      certifiedDesignations: ["HOD", "CEO", "CFO", "COO", "Chairperson", "President", "Director", "VP"],
      employees: [],
      items: [],
      log: [],
      employeeDirectory: []
    },
    "Microsoft": {
      name: "Microsoft",
      certifiedDesignations: ["HOD", "CEO", "CFO", "COO", "Chairperson", "President", "Director", "VP"],
      employees: [],
      items: [],
      log: [],
      employeeDirectory: []
    },
    "Cara": {
      name: "Cara",
      certifiedDesignations: ["HOD", "CEO", "CFO", "COO", "Chairperson", "President", "Director", "VP"],
      employees: [],
      items: [],
      log: [],
      employeeDirectory: []
    },
    "ZynEra": {
      name: "ZynEra",
      certifiedDesignations: ["HOD", "CEO", "CFO", "COO", "Chairperson", "President", "Director", "VP"],
      employees: [],
      items: [],
      log: [],
      employeeDirectory: []
    }
  };

  /* ============ DATABASE SERVICE (SUPABASE & LOCAL STORAGE) ============ */
  const DbService = {
    isSupabase: false,
    client: null,

    init: async function() {
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          if (typeof supabase !== 'undefined') {
            this.client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            this.isSupabase = true;
            console.log("DbService: Connected to Supabase.");
            
            // Automatically migrate local storage data if changes exist or first time connecting
            const hasOffline = localStorage.getItem('asset_track:has_offline_changes') === 'true';
            const notMigrated = localStorage.getItem('asset_track:migrated_to_supabase') !== 'true';
            if (hasOffline || notMigrated) {
              await this.migrateLocalToSupabase(true);
            }
          } else {
            console.warn("DbService: Supabase SDK not found. Falling back to localStorage.");
          }
        } catch(e) {
          console.error("DbService: Failed to connect to Supabase:", e);
        }
      } else {
        console.log("DbService: No Supabase credentials. Running in local fallback mode.");
        // Clear migration status so it re-migrates if Supabase is reconnected later
        localStorage.removeItem('asset_track:migrated_to_supabase');
      }
      loadDatabase();
    },

    migrateLocalToSupabase: async function(force) {
      if (!this.isSupabase) return { success: false, message: 'Supabase is not connected.' };
      
      // Self-heal: If local user session exists but is missing from Supabase table,
      // force clear the migration status so the data uploads.
      const localSession = localStorage.getItem('asset_track:currentUser');
      if (localSession && !force) {
        try {
          const parsed = JSON.parse(localSession);
          const { data, error } = await this.client.from('employees').select('office_id').eq('office_id', parsed.officeId);
          if (error) return { success: false, message: error.message };
          if (!data || data.length === 0) {
            console.log("DbService: Active local user not found on Supabase. Force-resetting migration flag.");
            localStorage.removeItem('asset_track:migrated_to_supabase');
          }
        } catch(e) {
          return { success: false, message: e.message };
        }
      }
      
      if (!force && localStorage.getItem('asset_track:migrated_to_supabase') === 'true') {
        return { success: true, message: 'Already migrated.' };
      }
      
      console.log("DbService: Starting migration of localStorage to Supabase...");
      
      try {
        const raw = localStorage.getItem('asset_track:db');
        if (!raw) return { success: true, message: 'No local data to migrate.' };
        const localDb = JSON.parse(raw);
        
        for (const companyName in localDb.companies) {
          const localCompany = localDb.companies[companyName];
          
          // 1. Get or create company in Supabase
          let companyId = null;
          let compRes = await this.client.from('companies').select('id').eq('name', companyName);
          if (compRes.error) return { success: false, message: compRes.error.message };
          
          if (compRes.data && compRes.data.length > 0) {
            companyId = compRes.data[0].id;
          } else {
            const insertComp = await this.client.from('companies').insert({
              name: companyName,
              certified_designations: localCompany.certifiedDesignations || DEFAULT_CERTIFIED
            }).select();
            if (insertComp.error) return { success: false, message: insertComp.error.message };
            if (insertComp.data && insertComp.data.length > 0) {
              companyId = insertComp.data[0].id;
            }
          }
          
          if (!companyId) continue;
          
          // 2. Migrate employees
          if (localCompany.employees && localCompany.employees.length > 0) {
            for (const emp of localCompany.employees) {
              const empCheck = await this.client.from('employees').select('office_id').eq('office_id', emp.officeId);
              if (empCheck.error) return { success: false, message: empCheck.error.message };
              
              if (!empCheck.data || empCheck.data.length === 0) {
                const insertEmp = await this.client.from('employees').insert({
                  office_id: emp.officeId,
                  admin_id: emp.adminId || null,
                  name: emp.name,
                  post: emp.post,
                  company_id: companyId,
                  company_name: companyName,
                  personal_phone: emp.personalPhone,
                  official_phone: emp.officialPhone,
                  email: emp.email,
                  password: emp.password,
                  role: emp.role,
                  is_blocked: emp.isBlocked || false
                });
                if (insertEmp.error) return { success: false, message: insertEmp.error.message };
              }
            }
          }
          
          // 3. Migrate items (assets)
          if (localCompany.items && localCompany.items.length > 0) {
            for (const item of localCompany.items) {
              const itemCheck = await this.client.from('items').select('id').eq('id', item.id);
              if (itemCheck.error) return { success: false, message: itemCheck.error.message };
              
              if (!itemCheck.data || itemCheck.data.length === 0) {
                const insertItem = await this.client.from('items').insert({
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  quantity: item.quantity,
                  barcode: item.barcode,
                  department: item.department,
                  location: item.location,
                  notes: item.notes,
                  status: item.status,
                  assigned_to: item.assignedTo,
                  visible_to_users: item.visibleToUsers !== false,
                  company_id: companyId
                });
                if (insertItem.error) return { success: false, message: insertItem.error.message };
              }
            }
          }
          
          // 4. Migrate logs
          if (localCompany.log && localCompany.log.length > 0) {
            for (const l of localCompany.log) {
              const logCheck = await this.client.from('activity_log').select('id').eq('id', l.id);
              if (logCheck.error) return { success: false, message: logCheck.error.message };
              
              if (!logCheck.data || logCheck.data.length === 0) {
                const insertLog = await this.client.from('activity_log').insert({
                  id: l.id,
                  action: l.action,
                  item_id: l.itemId,
                  item_name: l.itemName,
                  by_name: l.by,
                  ts: l.ts,
                  note: l.note,
                  company_id: companyId
                });
                if (insertLog.error) return { success: false, message: insertLog.error.message };
              }
            }
          }
          
          // 4.5 Migrate employee directory whitelist
          if (localCompany.employeeDirectory && localCompany.employeeDirectory.length > 0) {
            for (const dirEmp of localCompany.employeeDirectory) {
              const dirCheck = await this.client.from('employee_directory').select('id').eq('id', dirEmp.id);
              if (dirCheck.error) return { success: false, message: dirCheck.error.message };
              
              if (!dirCheck.data || dirCheck.data.length === 0) {
                const insertDir = await this.client.from('employee_directory').insert({
                  id: dirEmp.id,
                  company_id: companyId,
                  office_id: dirEmp.officeId,
                  name: dirEmp.name,
                  designation: dirEmp.designation,
                  official_phone: dirEmp.officialPhone,
                  personal_phone: dirEmp.personalPhone || null,
                  email: dirEmp.email || null
                });
                if (insertDir.error) return { success: false, message: insertDir.error.message };
              }
            }
          }
        }
        
        localStorage.setItem('asset_track:migrated_to_supabase', 'true');
        localStorage.removeItem('asset_track:has_offline_changes');
        console.log("DbService: Migration completed successfully!");
        return { success: true, message: 'Migration completed successfully.' };
      } catch(e) {
        console.error("DbService: Error during migration to Supabase:", e);
        return { success: false, message: e.message };
      }
    },

    getCompanies: async function() {
      if (this.isSupabase) {
        const { data, error } = await this.client.from('companies').select('name');
        if (error) {
          console.error("Error fetching companies:", error);
          return Object.keys(db.companies);
        }
        return data ? data.map(c => c.name) : [];
      } else {
        return Object.keys(db.companies);
      }
    },

    login: async function(loginId, password) {
      if (this.isSupabase) {
        // Try admin_id search (case-insensitive via ilike)
        let res = await this.client.from('employees').select('*').ilike('admin_id', loginId);
        let role = 'admin';
        let dbError = res.error;
        
        if (res.error || !res.data || res.data.length === 0) {
          // Try office_id search (case-insensitive via ilike)
          res = await this.client.from('employees').select('*').ilike('office_id', loginId);
          role = 'user';
          if (res.error) dbError = res.error;
        }
        
        if (dbError) {
          console.error("Supabase Database Error during login:", dbError);
          return { success: false, message: 'Database Error: ' + dbError.message + ' (Check if you ran the SQL schema queries and disabled RLS in Supabase).' };
        }
        
        // If not found or password doesn't match, check if we can migrate from localStorage
        let needsMigration = false;
        if (!res.data || res.data.length === 0 || res.data[0].password !== password) {
          let foundLocalUser = null;
          for (const compName in db.companies) {
            const comp = db.companies[compName];
            let emp = comp.employees.find(e => e.adminId && e.adminId.toLowerCase() === loginId.toLowerCase());
            if (emp) { foundLocalUser = emp; break; }
            emp = comp.employees.find(e => e.officeId && e.officeId.toLowerCase() === loginId.toLowerCase());
            if (emp) { foundLocalUser = emp; break; }
          }
          if (foundLocalUser && foundLocalUser.password === password) {
            needsMigration = true;
          }
        }
        
        if (needsMigration) {
          console.log("DbService: Found matching offline credentials. Migrating company data to Supabase...");
          const syncRes = await this.migrateLocalToSupabase(true);
          if (!syncRes.success) {
            return { success: false, message: 'Sync failed: ' + syncRes.message + ' (Check if you ran the SQL schema queries and disabled RLS in Supabase).' };
          }
          
          // Re-query Supabase (case-insensitive via ilike)
          res = await this.client.from('employees').select('*').ilike('admin_id', loginId);
          role = 'admin';
          if (!res.data || res.data.length === 0) {
            res = await this.client.from('employees').select('*').ilike('office_id', loginId);
            role = 'user';
          }
        }
        
        if (!res.data || res.data.length === 0) {
          return { success: false, message: 'Invalid ID or Password.' };
        }
        
        const emp = res.data[0];
        if (emp.password !== password) {
          return { success: false, message: 'Invalid ID or Password.' };
        }
        if (emp.is_blocked) {
          return { success: false, message: 'Access Denied: Your account is blocked.' };
        }
        
        const user = {
          officeId: emp.office_id,
          adminId: emp.admin_id,
          name: emp.name,
          post: emp.post,
          company: emp.company_name,
          companyId: emp.company_id,
          personalPhone: emp.personal_phone,
          officialPhone: emp.official_phone,
          email: emp.email,
          password: emp.password,
          role: role,
          isBlocked: emp.is_blocked
        };
        return { success: true, user: user };
      } else {
        let foundUser = null;
        let loggedInRole = 'user';
        for (const compName in db.companies) {
          const comp = db.companies[compName];
          let emp = comp.employees.find(e => e.adminId && e.adminId.toLowerCase() === loginId.toLowerCase());
          if (emp) { foundUser = emp; loggedInRole = 'admin'; break; }
          emp = comp.employees.find(e => e.officeId.toLowerCase() === loginId.toLowerCase());
          if (emp) { foundUser = emp; loggedInRole = 'user'; break; }
        }
        if (!foundUser || foundUser.password !== password) {
          return { success: false, message: 'Invalid ID or Password.' };
        }
        if (foundUser.isBlocked) {
          return { success: false, message: 'Access Denied: Your account is blocked by the administrator.' };
        }
        const user = Object.assign({}, foundUser, { role: loggedInRole });
        return { success: true, user: user };
      }
    },

    isOfficeIdRegistered: async function(officeId, companyName) {
      if (this.isSupabase) {
        const { data } = await this.client.from('employees').select('office_id').eq('office_id', officeId).eq('company_name', companyName);
        return !!(data && data.length > 0);
      } else {
        const compObj = db.companies[companyName];
        return !!(compObj && compObj.employees.some(e => e.officeId.toLowerCase() === officeId.toLowerCase()));
      }
    },

    isPhoneRegistered: async function(personalPhone, officialPhone, companyName, currentOfficeId) {
      if (this.isSupabase) {
        const { data, error } = await this.client.from('employees').select('office_id, personal_phone, official_phone').eq('company_name', companyName);
        if (error || !data) return false;
        
        for (const emp of data) {
          if (currentOfficeId && emp.office_id.toLowerCase() === currentOfficeId.toLowerCase()) {
            continue;
          }
          if (emp.personal_phone === personalPhone || emp.official_phone === personalPhone) {
            return true;
          }
          if (emp.personal_phone === officialPhone || emp.official_phone === officialPhone) {
            return true;
          }
        }
        return false;
      } else {
        const company = db.companies[companyName];
        if (!company || !company.employees) return false;
        
        for (const emp of company.employees) {
          if (currentOfficeId && emp.officeId.toLowerCase() === currentOfficeId.toLowerCase()) {
            continue;
          }
          if (emp.personalPhone === personalPhone || emp.officialPhone === personalPhone) {
            return true;
          }
          if (emp.personalPhone === officialPhone || emp.officialPhone === officialPhone) {
            return true;
          }
        }
        return false;
      }
    },

    isAdminIdRegistered: async function(adminId) {
      if (this.isSupabase) {
        const { data } = await this.client.from('employees').select('admin_id').eq('admin_id', adminId);
        return !!(data && data.length > 0);
      } else {
        for (const compName in db.companies) {
          const exists = db.companies[compName].employees.some(e => e.adminId && e.adminId.toLowerCase() === adminId.toLowerCase());
          if (exists) return true;
        }
        return false;
      }
    },

    checkDesignationCertified: async function(post, companyName) {
      if (!post) return false;
      const lower = post.toLowerCase();
      
      if (this.isSupabase) {
        const { data } = await this.client.from('companies').select('certified_designations').eq('name', companyName);
        const certList = (data && data[0]) ? data[0].certified_designations : DEFAULT_CERTIFIED;
        return certList.some(k => lower.includes(k.toLowerCase()));
      } else {
        const comp = db.companies[companyName];
        const certList = comp ? comp.certifiedDesignations : DEFAULT_CERTIFIED;
        return certList.some(k => lower.includes(k.toLowerCase()));
      }
    },

    signup: async function(empData) {
      if (this.isSupabase) {
        // Find or create company
        let companyId = null;
        let certs = [...DEFAULT_CERTIFIED];
        let compRes = await this.client.from('companies').select('id, certified_designations').eq('name', empData.company);
        
        if (compRes.data && compRes.data.length > 0) {
          companyId = compRes.data[0].id;
          certs = compRes.data[0].certified_designations;
        } else {
          if (empData.role !== 'admin') {
            return { success: false, message: 'This company is not registered. An administrator must register it first by signing up in Admin Mode.' };
          }
          const insertComp = await this.client.from('companies').insert({ name: empData.company }).select();
          if (insertComp.error || !insertComp.data || insertComp.data.length === 0) {
            return { success: false, message: 'Failed to create new company in database.' };
          }
          companyId = insertComp.data[0].id;
        }
        
        // Verify designation eligibility
        const lower = empData.post.toLowerCase();
        const isCertified = certs.some(k => lower.includes(k.toLowerCase()));
        if (empData.role === 'admin' && !isCertified) {
          return { success: false, message: 'Designation not certified for Admin Mode.' };
        }
        
        // Populate whitelist directory
        let directoryList = [];
        if (empData.initialDirectoryText) {
          const lines = empData.initialDirectoryText.split('\n');
          for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const parts = line.split(/[,\t]/).map(p => p.trim());
            if (parts.length >= 4) {
              directoryList.push({
                id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
                company_id: companyId,
                office_id: parts[0],
                name: parts[1],
                designation: parts[2],
                official_phone: parts[3],
                personal_phone: parts[4] || '',
                email: parts[5] || ''
              });
            }
          }
        }
        
        // Ensure Admin itself is whitelisted
        if (!directoryList.some(e => e.office_id.toLowerCase() === empData.officeId.toLowerCase())) {
          directoryList.push({
            id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
            company_id: companyId,
            office_id: empData.officeId,
            name: empData.name,
            designation: empData.post,
            official_phone: empData.officialPhone,
            personal_phone: empData.personalPhone || '',
            email: empData.email || ''
          });
        }
        
        if (directoryList.length > 0) {
          const insertDir = await this.client.from('employee_directory').insert(directoryList);
          if (insertDir.error) {
            return { success: false, message: 'Failed to populate employee directory: ' + insertDir.error.message };
          }
        }

        const insertEmp = await this.client.from('employees').insert({
          office_id: empData.officeId,
          admin_id: empData.adminId || null,
          name: empData.name,
          post: empData.post,
          company_id: companyId,
          company_name: empData.company,
          personal_phone: empData.personalPhone,
          official_phone: empData.officialPhone,
          email: empData.email,
          password: empData.password,
          role: empData.role,
          is_blocked: false
        });
        
        if (insertEmp.error) {
          return { success: false, message: insertEmp.error.message };
        }
        
        const user = {
          officeId: empData.officeId,
          adminId: empData.adminId || null,
          name: empData.name,
          post: empData.post,
          company: empData.company,
          companyId: companyId,
          personalPhone: empData.personalPhone,
          officialPhone: empData.officialPhone,
          email: empData.email,
          password: empData.password,
          role: empData.role,
          isBlocked: false
        };
        return { success: true, user: user };
      } else {
        const companyName = empData.company;
        if (!db.companies[companyName]) {
          if (empData.role !== 'admin') {
            return { success: false, message: 'This company is not registered. An administrator must register it first by signing up in Admin Mode.' };
          }
          db.companies[companyName] = {
            name: companyName,
            certifiedDesignations: [...DEFAULT_CERTIFIED],
            employees: [],
            items: [],
            log: [],
            employeeDirectory: []
          };
        }
        
        // Populate local whitelist directory
        if (empData.initialDirectoryText) {
          const lines = empData.initialDirectoryText.split('\n');
          for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const parts = line.split(/[,\t]/).map(p => p.trim());
            if (parts.length >= 4) {
              db.companies[companyName].employeeDirectory.push({
                id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
                officeId: parts[0],
                name: parts[1],
                designation: parts[2],
                officialPhone: parts[3],
                personalPhone: parts[4] || '',
                email: parts[5] || ''
              });
            }
          }
        }
        
        // Ensure Admin itself is whitelisted locally
        if (!db.companies[companyName].employeeDirectory.some(e => e.officeId.toLowerCase() === empData.officeId.toLowerCase())) {
          db.companies[companyName].employeeDirectory.push({
            id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
            officeId: empData.officeId,
            name: empData.name,
            designation: empData.post,
            officialPhone: empData.officialPhone,
            personalPhone: empData.personalPhone || '',
            email: empData.email || ''
          });
        }

        db.companies[companyName].employees.push(empData);
        saveDatabase();
        return { success: true, user: empData };
      }
    },

    loadAllData: async function() {
      if (!currentUser) return;
      
      if (this.isSupabase) {
        // Resolve companyId if undefined (e.g. from local storage restored session)
        if (!currentUser.companyId) {
          const compRes = await this.client.from('companies').select('id').eq('name', currentUser.company);
          if (compRes.data && compRes.data.length > 0) {
            currentUser.companyId = compRes.data[0].id;
            saveSession(currentUser);
          } else {
            console.warn("DbService: Failed to resolve company ID for name:", currentUser.company);
            const insertComp = await this.client.from('companies').insert({ name: currentUser.company }).select();
            if (insertComp.data && insertComp.data.length > 0) {
              currentUser.companyId = insertComp.data[0].id;
              saveSession(currentUser);
            }
          }
        }
        
        // Refresh block status
        const empRes = await this.client.from('employees').select('is_blocked').eq('office_id', currentUser.officeId);
        if (empRes.data && empRes.data.length > 0) {
          currentUser.isBlocked = empRes.data[0].is_blocked;
        }
        
        // Load items
        const itemsRes = await this.client.from('items').select('*').eq('company_id', currentUser.companyId);
        items = (itemsRes.data || []).map(i => ({
          id: i.id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          barcode: i.barcode,
          department: i.department || '',
          location: i.location || '',
          notes: i.notes || '',
          status: i.status,
          assignedTo: i.assigned_to || '',
          visibleToUsers: i.visible_to_users,
          checkedOutAt: i.checked_out_at ? new Date(i.checked_out_at).getTime() : null,
          expirationDate: i.expiration_date ? new Date(i.expiration_date).getTime() : null,
          createdAt: new Date(i.created_at).getTime(),
          updatedAt: new Date(i.updated_at).getTime()
        }));

        // Self-Healing Data Migration for checked-out legacy multi-quantity items
        let migratedFound = false;
        for (const item of items) {
          if (item.status === 'out' && item.quantity > 1) {
            console.log("Self-Healing: Splitting legacy checked-out asset", item.name);
            await this.client.from('items').update({
              quantity: item.quantity - 1,
              status: 'in',
              assigned_to: '',
              checked_out_at: null,
              expiration_date: null,
              updated_at: new Date().toISOString()
            }).eq('id', item.id);
            
            const childId = 'itm_' + Date.now() + Math.random().toString(36).slice(2, 5).toUpperCase();
            const childBarcode = item.barcode + '-' + Math.floor(100 + Math.random() * 900);
            
            await this.client.from('items').insert({
              id: childId,
              name: item.name,
              category: item.category,
              quantity: 1,
              barcode: childBarcode,
              department: item.department || '',
              location: item.location || '',
              notes: item.notes || '',
              status: 'out',
              assigned_to: item.assignedTo || currentUser.name,
              checked_out_at: item.checkedOutAt ? new Date(item.checkedOutAt).toISOString() : new Date().toISOString(),
              expiration_date: item.expirationDate ? new Date(item.expirationDate).toISOString() : new Date().toISOString(),
              visible_to_users: item.visibleToUsers,
              company_id: currentUser.companyId
            });
            migratedFound = true;
          }
        }

        if (migratedFound) {
          const itemsRes2 = await this.client.from('items').select('*').eq('company_id', currentUser.companyId);
          items = (itemsRes2.data || []).map(i => ({
            id: i.id,
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            barcode: i.barcode,
            department: i.department || '',
            location: i.location || '',
            notes: i.notes || '',
            status: i.status,
            assignedTo: i.assigned_to || '',
            visibleToUsers: i.visible_to_users,
            checkedOutAt: i.checked_out_at ? new Date(i.checked_out_at).getTime() : null,
            expirationDate: i.expiration_date ? new Date(i.expiration_date).getTime() : null,
            createdAt: new Date(i.created_at).getTime(),
            updatedAt: new Date(i.updated_at).getTime()
          }));
        }

        // Auto-checkin expired assets in Supabase
        let expiredFound = false;
        for (const item of items) {
          if (item.status === 'out' && item.expirationDate && item.expirationDate <= Date.now()) {
            console.log("Auto-Checkin (Supabase): Session expired for asset", item.name);
            await this.checkIn(item.id, item.assignedTo, true);
            expiredFound = true;
          }
        }
        
        if (expiredFound) {
          const itemsRes2 = await this.client.from('items').select('*').eq('company_id', currentUser.companyId);
          items = (itemsRes2.data || []).map(i => ({
            id: i.id,
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            barcode: i.barcode,
            department: i.department || '',
            location: i.location || '',
            notes: i.notes || '',
            status: i.status,
            assignedTo: i.assigned_to || '',
            visibleToUsers: i.visible_to_users,
            checkedOutAt: i.checked_out_at ? new Date(i.checked_out_at).getTime() : null,
            expirationDate: i.expiration_date ? new Date(i.expiration_date).getTime() : null,
            createdAt: new Date(i.created_at).getTime(),
            updatedAt: new Date(i.updated_at).getTime()
          }));
        }
        
        // Load log
        const logRes = await this.client.from('activity_log').select('*').eq('company_id', currentUser.companyId).order('ts', { ascending: false }).limit(300);
        log = (logRes.data || []).map(l => ({
          id: l.id,
          action: l.action,
          itemId: l.item_id,
          itemName: l.item_name,
          by: l.by_name,
          ts: Number(l.ts),
          note: l.note || ''
        }));
        
        // Load certified designations
        const compRes = await this.client.from('companies').select('certified_designations').eq('id', currentUser.companyId);
        certifiedDesignations = (compRes.data && compRes.data[0]) ? compRes.data[0].certified_designations : DEFAULT_CERTIFIED;
      } else {
        loadCompanyData();
        const company = db.companies[currentUser.company];
        certifiedDesignations = (company && company.certifiedDesignations) ? company.certifiedDesignations : DEFAULT_CERTIFIED;

        // Self-Healing Data Migration for checked-out legacy multi-quantity items in Local Storage
        let migratedLocal = false;
        for (const item of items) {
          if (item.status === 'out' && item.quantity > 1) {
            console.log("Self-Healing (Local): Splitting legacy checked-out asset", item.name);
            item.quantity -= 1;
            item.status = 'in';
            const oldAssignedTo = item.assignedTo || currentUser.name;
            const oldCheckedOutAt = item.checkedOutAt || Date.now();
            const oldExpirationDate = item.expirationDate || (Date.now() + 90*24*60*60*1000);
            
            item.assignedTo = '';
            item.checkedOutAt = null;
            item.expirationDate = null;
            item.updatedAt = Date.now();
            
            const childBarcode = item.barcode + '-' + Math.floor(100 + Math.random() * 900);
            const childItem = {
              id: 'itm_' + Date.now() + Math.random().toString(36).slice(2, 5).toUpperCase(),
              name: item.name,
              category: item.category,
              quantity: 1,
              barcode: childBarcode,
              department: item.department || '',
              location: item.location || '',
              notes: item.notes || '',
              status: 'out',
              assignedTo: oldAssignedTo,
              checkedOutAt: oldCheckedOutAt,
              expirationDate: oldExpirationDate,
              visibleToUsers: item.visibleToUsers
            };
            
            items.unshift(childItem);
            migratedLocal = true;
          }
        }
        if (migratedLocal) {
          await saveItems();
          loadCompanyData();
        }
        
        // Auto-checkin expired assets in Local Storage
        let expiredFound = false;
        for (const item of items) {
          if (item.status === 'out' && item.expirationDate && item.expirationDate <= Date.now()) {
            console.log("Auto-Checkin (Local): Session expired for asset", item.name);
            await this.checkIn(item.id, item.assignedTo, true);
            expiredFound = true;
          }
        }
        if (expiredFound) {
          loadCompanyData();
        }
      }
    },

    addItem: async function(item) {
      if (this.isSupabase) {
        await this.client.from('items').insert({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          barcode: item.barcode,
          department: item.department,
          location: item.location,
          notes: item.notes,
          status: item.status,
          assigned_to: item.assignedTo,
          visible_to_users: item.visibleToUsers,
          company_id: currentUser.companyId
        });
        await this.addLogEntry('added', item, item.department ? ('Dept: ' + item.department) : '');
      } else {
        items.unshift(item);
        await saveItems();
        addLogEntry('added', item, item.department ? ('Dept: '+item.department) : '');
      }
    },

    updateItem: async function(item) {
      if (this.isSupabase) {
        await this.client.from('items').update({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          barcode: item.barcode,
          department: item.department,
          location: item.location,
          notes: item.notes,
          visible_to_users: item.visibleToUsers,
          updated_at: new Date().toISOString()
        }).eq('id', item.id);
        await this.addLogEntry('edited', item, '');
      } else {
        await saveItems();
        addLogEntry('edited', item, '');
      }
    },

    checkOut: async function(id, assignedTo, note) {
      if (this.isSupabase) {
        const activeEmps = await this.getEmployees();
        const target = activeEmps.find(e => e.name.toLowerCase() === assignedTo.toLowerCase());
        const isTargetAdmin = (target && (target.adminId || target.role === 'admin')) || (currentUser && currentUser.name.toLowerCase() === assignedTo.toLowerCase() && currentUser.role === 'admin');
        const months = isTargetAdmin ? 6 : 3;
        const now = new Date();
        const exp = new Date();
        exp.setMonth(now.getMonth() + months);

        const item = items.find(i => i.id === id);
        if (item) {
          if (item.quantity > 1) {
            await this.client.from('items').update({
              quantity: item.quantity - 1,
              updated_at: now.toISOString()
            }).eq('id', id);
            
            const childId = 'itm_' + Date.now() + Math.random().toString(36).slice(2, 5).toUpperCase();
            const childBarcode = item.barcode + '-' + Math.floor(100 + Math.random() * 900);
            
            const childItem = {
              id: childId,
              name: item.name,
              category: item.category,
              quantity: 1,
              barcode: childBarcode,
              department: item.department || '',
              location: item.location || '',
              notes: item.notes || '',
              status: 'out',
              assigned_to: assignedTo,
              checked_out_at: now.toISOString(),
              expiration_date: exp.toISOString(),
              visible_to_users: item.visibleToUsers,
              company_id: currentUser.companyId
            };
            
            await this.client.from('items').insert(childItem);
            await this.addLogEntry('checked-out', { id: childId, name: item.name, barcode: childBarcode }, note || ('To: ' + assignedTo + ' (1 unit from stock)'));
          } else {
            await this.client.from('items').update({
              status: 'out',
              assigned_to: assignedTo,
              checked_out_at: now.toISOString(),
              expiration_date: exp.toISOString(),
              updated_at: now.toISOString()
            }).eq('id', id);
            
            await this.addLogEntry('checked-out', item, note || ('To: ' + assignedTo));
          }
        }
      } else {
        const company = db.companies[currentUser.company];
        const activeEmps = company ? (company.employees || []) : [];
        const target = activeEmps.find(e => e.name.toLowerCase() === assignedTo.toLowerCase());
        const isTargetAdmin = (target && (target.adminId || target.role === 'admin')) || (currentUser && currentUser.name.toLowerCase() === assignedTo.toLowerCase() && currentUser.role === 'admin');
        const months = isTargetAdmin ? 6 : 3;
        const now = new Date();
        const exp = new Date();
        exp.setMonth(now.getMonth() + months);

        const item = items.find(i => i.id === id);
        if (item) {
          if (item.quantity > 1) {
            item.quantity -= 1;
            const childBarcode = item.barcode + '-' + Math.floor(100 + Math.random() * 900);
            const childItem = {
              id: 'itm_' + Date.now() + Math.random().toString(36).slice(2, 5).toUpperCase(),
              name: item.name,
              category: item.category,
              quantity: 1,
              barcode: childBarcode,
              department: item.department || '',
              location: item.location || '',
              notes: item.notes || '',
              status: 'out',
              assignedTo: assignedTo,
              checkedOutAt: now.getTime(),
              expirationDate: exp.getTime(),
              visibleToUsers: item.visibleToUsers
            };
            
            items.unshift(childItem);
            await saveItems();
            addLogEntry('checked-out', childItem, note ? note : ('To: '+assignedTo + ' (1 unit from stock)'));
          } else {
            item.status = 'out';
            item.assignedTo = assignedTo;
            item.checkedOutAt = now.getTime();
            item.expirationDate = exp.getTime();
            item.updatedAt = now.getTime();
            await saveItems();
            addLogEntry('checked-out', item, note ? note : ('To: '+assignedTo));
          }
        }
      }
    },

    checkIn: async function(id, returnedFrom, isSelfReturn) {
      if (this.isSupabase) {
        const item = items.find(i => i.id === id);
        if (item) {
          const hyphenIdx = item.barcode.lastIndexOf('-');
          let parentItem = null;
          if (hyphenIdx > 0) {
            const parentBarcode = item.barcode.substring(0, hyphenIdx);
            parentItem = items.find(i => i.barcode === parentBarcode);
          }
          
          if (parentItem) {
            await this.client.from('items').update({
              quantity: parentItem.quantity + 1,
              status: 'in',
              assigned_to: '',
              checked_out_at: null,
              expiration_date: null,
              updated_at: new Date().toISOString()
            }).eq('id', parentItem.id);
            
            await this.client.from('items').delete().eq('id', id);
            
            const logNote = isSelfReturn ? 'Self check-in (returned) by user' : (returnedFrom ? 'From: ' + returnedFrom : '');
            await this.addLogEntry('checked-in', parentItem, logNote + ' (restored to stock)');
          } else {
            await this.client.from('items').update({
              status: 'in',
              assigned_to: '',
              checked_out_at: null,
              expiration_date: null,
              updated_at: new Date().toISOString()
            }).eq('id', id);
            
            const logNote = isSelfReturn ? 'Self check-in (returned) by user' : (returnedFrom ? 'From: ' + returnedFrom : '');
            await this.addLogEntry('checked-in', item, logNote);
          }
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item) {
          const hyphenIdx = item.barcode.lastIndexOf('-');
          let parentItem = null;
          if (hyphenIdx > 0) {
            const parentBarcode = item.barcode.substring(0, hyphenIdx);
            parentItem = items.find(i => i.barcode === parentBarcode);
          }
          
          if (parentItem) {
            parentItem.quantity += 1;
            parentItem.status = 'in';
            parentItem.assignedTo = '';
            parentItem.checkedOutAt = null;
            parentItem.expirationDate = null;
            items = items.filter(i => i.id !== id);
            await saveItems();
            
            const logNote = isSelfReturn ? 'Self check-in (returned) by user' : (returnedFrom ? 'From: ' + returnedFrom : '');
            addLogEntry('checked-in', parentItem, logNote + ' (restored to stock)');
          } else {
            item.status = 'in';
            item.assignedTo = '';
            item.checkedOutAt = null;
            item.expirationDate = null;
            item.updatedAt = Date.now();
            await saveItems();
            
            if (!isSelfReturn) {
              addLogEntry('checked-in', item, returnedFrom ? ('From: '+returnedFrom) : '');
            } else {
              addLogEntry('checked-in', item, `Self check-in (returned) by user`);
            }
          }
        }
      }
    },

    deleteItem: async function(id) {
      if (this.isSupabase) {
        const item = items.find(i => i.id === id);
        await this.client.from('items').delete().eq('id', id);
        if (item) {
          await this.addLogEntry('deleted', item, '');
        }
      } else {
        const item = items.find(i=>i.id===id);
        items = items.filter(i => i.id !== id);
        await saveItems();
        if (item) {
          addLogEntry('deleted', item, '');
        }
      }
    },

    getEmployees: async function() {
      if (this.isSupabase) {
        const { data } = await this.client.from('employees').select('*').eq('company_id', currentUser.companyId);
        return (data || []).map(e => ({
          officeId: e.office_id,
          adminId: e.admin_id,
          name: e.name,
          post: e.post,
          company: e.company_name,
          personalPhone: e.personal_phone,
          officialPhone: e.official_phone,
          email: e.email,
          isBlocked: e.is_blocked
        }));
      } else {
        const company = db.companies[currentUser.company];
        return company ? (company.employees || []) : [];
      }
    },

    toggleBlockUser: async function(officeId) {
      if (this.isSupabase) {
        const empRes = await this.client.from('employees').select('is_blocked, name').eq('office_id', officeId);
        if (empRes.data && empRes.data.length > 0) {
          const nextState = !empRes.data[0].is_blocked;
          await this.client.from('employees').update({ is_blocked: nextState }).eq('office_id', officeId);
          return { success: true, name: empRes.data[0].name, isBlocked: nextState };
        }
        return { success: false };
      } else {
        const company = db.companies[currentUser.company];
        const emp = company.employees.find(e => e.officeId.toLowerCase() === officeId.toLowerCase());
        if (emp) {
          emp.isBlocked = !emp.isBlocked;
          saveDatabase();
          return { success: true, name: emp.name, isBlocked: emp.isBlocked };
        }
        return { success: false };
      }
    },

    addCertifiedDesignation: async function(val) {
      if (this.isSupabase) {
        const certs = await this.getCertifiedDesignations();
        if (!certs.some(d => d.toLowerCase() === val.toLowerCase())) {
          certs.push(val);
          await this.client.from('companies').update({ certified_designations: certs }).eq('id', currentUser.companyId);
        }
      } else {
        const company = db.companies[currentUser.company];
        if (!company.certifiedDesignations) company.certifiedDesignations = [...DEFAULT_CERTIFIED];
        company.certifiedDesignations.push(val);
        saveDatabase();
      }
    },

    removeCertifiedDesignation: async function(val) {
      if (this.isSupabase) {
        const certs = await this.getCertifiedDesignations();
        const updated = certs.filter(d => d.toLowerCase() !== val.toLowerCase());
        await this.client.from('companies').update({ certified_designations: updated }).eq('id', currentUser.companyId);
      } else {
        const company = db.companies[currentUser.company];
        if (company.certifiedDesignations) {
          company.certifiedDesignations = company.certifiedDesignations.filter(d => d.toLowerCase() !== val.toLowerCase());
          saveDatabase();
        }
      }
    },

    getCertifiedDesignations: async function() {
      if (this.isSupabase) {
        const { data } = await this.client.from('companies').select('certified_designations').eq('id', currentUser.companyId);
        return (data && data[0]) ? data[0].certified_designations : DEFAULT_CERTIFIED;
      } else {
        const company = db.companies[currentUser.company];
        return (company && company.certifiedDesignations) ? company.certifiedDesignations : DEFAULT_CERTIFIED;
      }
    },

    getDirectoryEmployees: async function() {
      let directory = [];
      let employees = [];
      
      if (this.isSupabase) {
        const { data } = await this.client.from('employee_directory').select('*').eq('company_id', currentUser.companyId);
        directory = (data || []).map(e => ({
          id: e.id,
          officeId: e.office_id,
          name: e.name,
          designation: e.designation,
          officialPhone: e.official_phone,
          personalPhone: e.personal_phone || '',
          email: e.email || ''
        }));
        
        // Fetch signed up employees
        const empRes = await this.client.from('employees').select('*').eq('company_id', currentUser.companyId);
        employees = (empRes.data || []).map(e => ({
          officeId: e.office_id,
          name: e.name,
          post: e.post,
          officialPhone: e.official_phone,
          personalPhone: e.personal_phone,
          email: e.email
        }));
        
        // Auto-sync missing whitelist entries
        let needsRefetch = false;
        for (const emp of employees) {
          if (!directory.some(d => d.officeId.toLowerCase() === emp.officeId.toLowerCase())) {
            console.log("DbService: Auto-syncing active user to whitelist directory:", emp.name);
            await this.client.from('employee_directory').insert({
              id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
              company_id: currentUser.companyId,
              office_id: emp.officeId,
              name: emp.name,
              designation: emp.post,
              official_phone: emp.officialPhone,
              personal_phone: emp.personalPhone || null,
              email: emp.email || null
            });
            needsRefetch = true;
          }
        }
        
        if (needsRefetch) {
          const { data: refetched } = await this.client.from('employee_directory').select('*').eq('company_id', currentUser.companyId);
          directory = (refetched || []).map(e => ({
            id: e.id,
            officeId: e.office_id,
            name: e.name,
            designation: e.designation,
            officialPhone: e.official_phone,
            personalPhone: e.personal_phone || '',
            email: e.email || ''
          }));
        }
      } else {
        const company = db.companies[currentUser.company];
        if (!company) return [];
        if (!company.employeeDirectory) company.employeeDirectory = [];
        directory = company.employeeDirectory;
        employees = company.employees || [];
        
        let needsSave = false;
        for (const emp of employees) {
          if (!directory.some(d => d.officeId.toLowerCase() === emp.officeId.toLowerCase())) {
            console.log("DbService: Auto-syncing active user to local whitelist directory:", emp.name);
            directory.push({
              id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
              officeId: emp.officeId,
              name: emp.name,
              designation: emp.post,
              officialPhone: emp.officialPhone,
              personalPhone: emp.personalPhone || '',
              email: emp.email || ''
            });
            needsSave = true;
          }
        }
        if (needsSave) {
          saveDatabase();
        }
      }
      
      return directory;
    },

    addDirectoryEmployee: async function(emp) {
      if (this.isSupabase) {
        const { data, error } = await this.client.from('employee_directory').insert({
          id: emp.id,
          company_id: currentUser.companyId,
          office_id: emp.officeId,
          name: emp.name,
          designation: emp.designation,
          official_phone: emp.officialPhone,
          personal_phone: emp.personalPhone || null,
          email: emp.email || null
        }).select();
        if (error) return { success: false, message: error.message };
        return { success: true };
      } else {
        const company = db.companies[currentUser.company];
        if (!company.employeeDirectory) company.employeeDirectory = [];
        
        if (company.employeeDirectory.some(e => e.officeId.toLowerCase() === emp.officeId.toLowerCase())) {
          return { success: false, message: 'Office ID already exists in directory.' };
        }
        company.employeeDirectory.push(emp);
        saveDatabase();
        return { success: true };
      }
    },

    updateDirectoryEmployee: async function(emp) {
      if (this.isSupabase) {
        const { error } = await this.client.from('employee_directory').update({
          office_id: emp.officeId,
          name: emp.name,
          designation: emp.designation,
          official_phone: emp.officialPhone,
          personal_phone: emp.personalPhone || null,
          email: emp.email || null
        }).eq('id', emp.id);
        if (error) return { success: false, message: error.message };
        return { success: true };
      } else {
        const company = db.companies[currentUser.company];
        if (!company.employeeDirectory) company.employeeDirectory = [];
        const idx = company.employeeDirectory.findIndex(e => e.id === emp.id);
        if (idx !== -1) {
          company.employeeDirectory[idx] = emp;
          saveDatabase();
          return { success: true };
        }
        return { success: false, message: 'Employee not found.' };
      }
    },

    deleteDirectoryEmployee: async function(id) {
      if (this.isSupabase) {
        const { error } = await this.client.from('employee_directory').delete().eq('id', id);
        if (error) return { success: false, message: error.message };
        return { success: true };
      } else {
        const company = db.companies[currentUser.company];
        if (!company.employeeDirectory) company.employeeDirectory = [];
        company.employeeDirectory = company.employeeDirectory.filter(e => e.id !== id);
        saveDatabase();
        return { success: true };
      }
    },

    checkDirectoryWhitelist: async function(officeId, name, companyName) {
      if (this.isSupabase) {
        const compRes = await this.client.from('companies').select('id').eq('name', companyName);
        if (compRes.error || !compRes.data || compRes.data.length === 0) {
          return null; // new company
        }
        const companyId = compRes.data[0].id;
        
        const { data, error } = await this.client.from('employee_directory').select('*').eq('company_id', companyId).ilike('office_id', officeId);
        if (error || !data || data.length === 0) return null;
        
        const dirEmp = data[0];
        if (dirEmp.name.trim().toLowerCase() === name.trim().toLowerCase()) {
          return {
            officeId: dirEmp.office_id,
            name: dirEmp.name,
            designation: dirEmp.designation,
            officialPhone: dirEmp.official_phone,
            personalPhone: dirEmp.personal_phone || '',
            email: dirEmp.email || ''
          };
        }
        return null;
      } else {
        const company = db.companies[companyName];
        if (!company) return null; // new company
        if (!company.employeeDirectory) company.employeeDirectory = [];
        
        const dirEmp = company.employeeDirectory.find(e => e.officeId.toLowerCase() === officeId.toLowerCase());
        if (dirEmp && dirEmp.name.trim().toLowerCase() === name.trim().toLowerCase()) {
          return dirEmp;
        }
        return null;
      }
    },

    getCompanyDirectoryCount: async function(companyName) {
      if (this.isSupabase) {
        const compRes = await this.client.from('companies').select('id').eq('name', companyName);
        if (compRes.error || !compRes.data || compRes.data.length === 0) {
          return 0;
        }
        const { count, error } = await this.client.from('employee_directory').select('*', { count: 'exact', head: true }).eq('company_id', compRes.data[0].id);
        if (error) return 0;
        return count || 0;
      } else {
        const company = db.companies[companyName];
        return (company && company.employeeDirectory) ? company.employeeDirectory.length : 0;
      }
    },

    addLogEntry: async function(action, item, note) {
      if (this.isSupabase) {
        await this.client.from('activity_log').insert({
          id: 'l' + Date.now() + Math.random().toString(36).slice(2,7),
          action: action,
          item_id: item ? item.id : null,
          item_name: item ? item.name : (note || ''),
          by_name: (currentUser ? currentUser.name : 'Unnamed user'),
          ts: Date.now(),
          note: note || '',
          company_id: currentUser.companyId
        });
      }
    }
  };

  /* ============ LOCAL STORAGE STORAGE WRAPPERS ============ */
  function loadDatabase() {
    const raw = localStorage.getItem('asset_track:db');
    if (raw) {
      try {
        db = JSON.parse(raw);
        if (!db.companies || !db.companies.Cara) {
          throw new Error("Outdated database schema");
        }
        for (const compName in db.companies) {
          const comp = db.companies[compName];
          if (!comp.certifiedDesignations) {
            comp.certifiedDesignations = [...DEFAULT_CERTIFIED];
          }
          if (!comp.employeeDirectory) {
            comp.employeeDirectory = [];
          }
        }
      } catch(e) {
        db = { companies: DEFAULT_COMPANIES };
        saveDatabase();
      }
    } else {
      db = { companies: DEFAULT_COMPANIES };
      saveDatabase();
    }
  }

  function saveDatabase() {
    localStorage.setItem('asset_track:db', JSON.stringify(db));
    if (!DbService.isSupabase) {
      localStorage.setItem('asset_track:has_offline_changes', 'true');
    }
  }

  function loadSession() {
    const session = localStorage.getItem('asset_track:currentUser');
    if (session) {
      try {
        currentUser = JSON.parse(session);
      } catch(e) {
        currentUser = null;
      }
    }
  }

  function saveSession(user) {
    currentUser = user;
    localStorage.setItem('asset_track:currentUser', JSON.stringify(user));
  }

  function clearSession() {
    currentUser = null;
    localStorage.removeItem('asset_track:currentUser');
  }

  function loadCompanyData() {
    if (!currentUser) return;
    const company = db.companies[currentUser.company];
    if (company) {
      items = company.items || [];
      log = company.log || [];
    } else {
      items = [];
      log = [];
    }
  }

  function checkBlocked() {
    return !!(currentUser && currentUser.isBlocked);
  }

  async function saveItems(){
    if (currentUser) {
      db.companies[currentUser.company].items = items;
      saveDatabase();
    }
  }

  async function saveLog(){
    if (currentUser) {
      if(log.length > 300) log = log.slice(0, 300);
      db.companies[currentUser.company].log = log;
      saveDatabase();
    }
  }

  function addLogEntry(action, item, note){
    log.unshift({
      id: 'l' + Date.now() + Math.random().toString(36).slice(2,7),
      action: action,
      itemId: item ? item.id : null,
      itemName: item ? item.name : (note || ''),
      by: (currentUser ? currentUser.name : 'Unnamed user'),
      ts: Date.now(),
      note: note || ''
    });
    saveLog();
  }

  /* ============ UTIL ============ */
  function uid(prefix){ return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase(); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function timeAgo(ts){
    const s = Math.floor((Date.now()-ts)/1000);
    if(s<60) return 'just now';
    if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago';
    if(s<604800) return Math.floor(s/86400)+'d ago';
    return new Date(ts).toLocaleDateString();
  }
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(()=>t.classList.remove('show'), 2600);
  }

  /* ============ OWNER CHECKS ============ */
  function isCompanyOwner() {
    if (!currentUser) return false;
    const post = (currentUser.post || '').toLowerCase();
    return post.includes('ceo') || post.includes('chairperson');
  }

  /* ============ RENDER: SHELL ============ */
  function setActiveNav(){
    document.querySelectorAll('.navitem').forEach(el=>{
      el.classList.toggle('active', el.dataset.view===currentView);
    });
  }

  function renderSidebarNav() {
    const navlist = document.getElementById('navlist');
    if (!currentUser) return;
    
    let html = '';
    if (currentUser.role === 'admin') {
      html += `
        <li class="navitem" data-view="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>Dashboard</li>
        <li class="navitem" data-view="inventory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8V21H3V8"/><path d="M1 3H23V8H1z"/><path d="M10 12H14"/></svg>Inventory</li>
        <li class="navitem" data-view="scan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V4a1 1 0 011-1h3M17 3h3a1 1 0 011 1v3M21 17v3a1 1 0 01-1 1h-3M7 21H4a1 1 0 01-1-1v-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg>Scan</li>
        <li class="navitem" data-view="log"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>Activity</li>
        <li class="navitem" data-view="employees"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>Employees</li>
      `;
    } else {
      html += `
        <li class="navitem" data-view="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>Dashboard</li>
        <li class="navitem" data-view="inventory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8V21H3V8"/><path d="M1 3H23V8H1z"/><path d="M10 12H14"/></svg>Inventory</li>
        <li class="navitem" data-view="scan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V4a1 1 0 011-1h3M17 3h3a1 1 0 011 1v3M21 17v3a1 1 0 01-1 1h-3M7 21H4a1 1 0 01-1-1v-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg>Scan</li>
        <li class="navitem" data-view="log"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>Activity</li>
      `;
    }
    navlist.innerHTML = html;
  }

  function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    clearSession();
    stopScanner();
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-root').style.display = 'flex';
    authViewState = 'login';
    renderAuth();
  }

  async function handleSwitchMode() {
    if (!currentUser) return;
    
    const newRole = currentUser.role === 'admin' ? 'user' : 'admin';
    currentUser.role = newRole;
    saveSession(currentUser);
    
    stopScanner();
    currentView = 'dashboard';
    
    showToast(`Switched to ${newRole === 'admin' ? 'Admin Mode' : 'User Mode'}.`);
    render();
  }

  function bindAuthEvents() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = handleLogout;
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) mobileLogoutBtn.onclick = handleLogout;
    
    const sidebarSwitchBtn = document.getElementById('sidebar-switch-btn');
    if (sidebarSwitchBtn) sidebarSwitchBtn.onclick = handleSwitchMode;
    const mobileSwitchBtn = document.getElementById('mobile-switch-btn');
    if (mobileSwitchBtn) mobileSwitchBtn.onclick = handleSwitchMode;
  }

  async function render(){
    setActiveNav();
    renderSidebarNav();
    
    const usernameEl = document.getElementById('sidebar-username');
    const userroleEl = document.getElementById('sidebar-userrole');
    if (currentUser) {
      if (usernameEl) usernameEl.textContent = currentUser.name;
      if (userroleEl) userroleEl.textContent = `${currentUser.role === 'admin' ? 'Admin Mode' : 'User Mode'} · ${currentUser.company}`;
    }

    let isRegisteredAdmin = !!(currentUser && currentUser.adminId);
    
    const sidebarSwitchContainer = document.getElementById('sidebar-switch-container');
    const mobileAdminActions = document.getElementById('mobile-admin-actions');
    
    if (currentUser && isRegisteredAdmin) {
      const targetModeName = currentUser.role === 'admin' ? 'User Mode' : 'Admin Mode';
      if (sidebarSwitchContainer) {
        sidebarSwitchContainer.innerHTML = `
          <button class="btn btn-sm btn-primary" id="sidebar-switch-btn" style="width:100%; justify-content:center; margin-bottom:8px; background:var(--accent); border-color:var(--accent); color:var(--accent-ink); font-weight:600;">Switch to ${targetModeName}</button>
        `;
      }
      if (mobileAdminActions) {
        mobileAdminActions.innerHTML = `
          <button class="btn btn-sm" id="mobile-switch-btn" style="font-size:11px; padding:4px 8px; background:var(--accent); border-color:var(--accent); color:var(--accent-ink); font-weight:600;">To ${targetModeName === 'User Mode' ? 'User' : 'Admin'}</button>
        `;
      }
    } else {
      if (sidebarSwitchContainer) sidebarSwitchContainer.innerHTML = '';
      if (mobileAdminActions) mobileAdminActions.innerHTML = '';
    }
    
    const root = document.getElementById('view-root');
    if(currentView==='dashboard') root.innerHTML = renderDashboard();
    else if(currentView==='inventory') root.innerHTML = renderInventory();
    else if(currentView==='scan') root.innerHTML = renderScan();
    else if(currentView==='log') root.innerHTML = renderLog();
    else if(currentView==='employees') root.innerHTML = await renderEmployees();
    afterRenderHooks();
    bindAuthEvents();
  }

  function afterRenderHooks(){
    if(currentView==='inventory'){
      document.querySelectorAll('.asset-tag').forEach(el=>{
        el.addEventListener('click', ()=> openDetailModal(el.dataset.id));
      });
      const s = document.getElementById('inv-search');
      if(s){ s.value = searchQuery; s.addEventListener('input', e=>{ searchQuery = e.target.value; renderInventoryListOnly(); }); }
      const st = document.getElementById('inv-status-filter');
      if(st){ st.value = statusFilter; st.addEventListener('change', e=>{ statusFilter=e.target.value; renderInventoryListOnly(); }); }
      const ct = document.getElementById('inv-cat-filter');
      if(ct){ ct.value = categoryFilter; ct.addEventListener('change', e=>{ categoryFilter=e.target.value; renderInventoryListOnly(); }); }
    }
    if(currentView==='scan'){
      const btn = document.getElementById('start-scan-btn');
      if(btn) btn.addEventListener('click', startScanner);
      const stopBtn = document.getElementById('stop-scan-btn');
      if(stopBtn) stopBtn.addEventListener('click', stopScanner);
      const manualForm = document.getElementById('manual-scan-form');
      if(manualForm) manualForm.addEventListener('submit', e=>{
        e.preventDefault();
        const val = document.getElementById('manual-code-input').value.trim();
        if(val) handleScannedCode(val);
      });
    }
  }

  /* ============ DASHBOARD ============ */
  function renderDashboard(){
    const myAssets = items.filter(i => i.status === 'out' && i.assignedTo.toLowerCase() === currentUser.name.toLowerCase());
    
    function getSessionDateTime(ts) {
      if (!ts) return { date: '—', time: '—' };
      const d = new Date(ts);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return { date: dateStr, time: timeStr };
    }

    // Calculate reminders for assets expiring in the last 5 days
    const alertsHtml = myAssets.map(asset => {
      let endTs = asset.expirationDate;
      if (!endTs && asset.checkedOutAt) {
        const isTargetAdmin = currentUser && currentUser.adminId;
        const months = isTargetAdmin ? 6 : 3;
        const d = new Date(asset.checkedOutAt);
        d.setMonth(d.getMonth() + months);
        endTs = d.getTime();
      }
      if (!endTs) return '';
      
      const msLeft = endTs - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft <= 5) {
        const urgentColor = daysLeft <= 1 ? 'var(--danger)' : '#856404';
        const urgentBg = daysLeft <= 1 ? '#f8d7da' : '#fff3cd';
        const urgentBorder = daysLeft <= 1 ? '#f5c6cb' : '#ffeeba';
        return `
          <div style="background:${urgentBg}; color:${urgentColor}; border:1px solid ${urgentBorder}; border-radius:8px; padding:12px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; font-size:13px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <div style="line-height:1.4;">
              <strong>Session Alert:</strong> ${daysLeft <= 0 ? 'Expired today!' : `${daysLeft} day${daysLeft===1?'':'s'} left`} before your session for <strong>"${esc(asset.name)}"</strong> expires. Extend your session before it is automatically checked back in.
            </div>
            <button class="btn btn-sm" style="margin-left:14px; font-size:12px; padding:4px 8px; background:${urgentColor}; border-color:${urgentColor}; color:#fff;" onclick="__app.openDetailModal('${asset.id}', true)">Extend Now</button>
          </div>
        `;
      }
      return '';
    }).join('');

    const myAssetsHtml = myAssets.length ? `
      <div class="panel" style="margin-bottom:20px; grid-column:1/-1;">
        <h3>My Checked-Out Assets (${myAssets.length})</h3>
        <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:16px; line-height:1.4;">
          Below are the devices currently checked out to your account.
        </p>
        <div style="display:grid; gap:16px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));">
          ${myAssets.map(asset => {
            let startTs = asset.checkedOutAt;
            let endTs = asset.expirationDate;
            if (!startTs) {
              startTs = asset.updatedAt || Date.now();
            }
            if (!endTs) {
              const isTargetAdmin = currentUser && currentUser.adminId;
              const months = isTargetAdmin ? 6 : 3;
              const d = new Date(startTs);
              d.setMonth(d.getMonth() + months);
              endTs = d.getTime();
            }
            const start = getSessionDateTime(startTs);
            const end = getSessionDateTime(endTs);
            
            return `
              <div class="asset-card" style="display:flex; flex-direction:column; padding:16px; border:1px solid var(--line-strong); border-radius:12px; background:#fff; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                  <div>
                    <span style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--ink-soft); display:block; margin-bottom:2px;">${esc(asset.category)}</span>
                    <h4 style="margin:0 0 4px 0; font-size:16px; font-weight:700; color:var(--ink);">${esc(asset.name)}</h4>
                    <div style="font-size:12px; color:var(--ink-soft); font-family:'IBM Plex Mono', monospace;">ID: ${esc(asset.barcode)}</div>
                  </div>
                  <button class="btn btn-sm btn-primary" onclick="__app.openDetailModal('${asset.id}', true)" style="font-size:12px; padding:6px 12px;">Manage / Extend</button>
                </div>
                
                <hr style="border:0; border-top:1px solid var(--line-strong); margin:12px 0;">
                
                <div style="display:flex; justify-content:space-between; gap:20px; text-align:left;">
                  <div style="flex:1;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--ink-soft); margin-bottom:4px;">Session Start</div>
                    <div style="font-size:13.5px; font-weight:600; color:var(--ink);">${start.date}</div>
                    <div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">${start.time}</div>
                  </div>
                  
                  <div style="flex:1; text-align:right; border-left:1px dashed var(--line-strong); padding-left:20px;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--ink-soft); margin-bottom:4px;">Session End</div>
                    <div style="font-size:13.5px; font-weight:600; color:var(--danger);">${end.date}</div>
                    <div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">${end.time}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const isAdmin = currentUser && currentUser.role === 'admin';
    
    if (!isAdmin) {
      // User Mode Dashboard
      return `
        <div class="topbar">
          <div>
            <div class="pagetitle">My Dashboard</div>
            <div class="pagesub">Welcome back, ${esc(currentUser.name)}</div>
          </div>
          <div class="stats-row">
            <div class="stat-chip"><div class="n">${myAssets.length}</div><div class="l">My Checked-Out Assets</div></div>
            <div class="stat-chip"><div class="n">${myAssets.filter(a => a.expirationDate && (a.expirationDate - Date.now() <= 5*24*60*60*1000)).length}</div><div class="l">Urgent Renewals</div></div>
          </div>
        </div>

        ${alertsHtml ? `<div style="margin-bottom:20px;">${alertsHtml}</div>` : ''}

        <div class="dash-grid">
          ${myAssets.length ? myAssetsHtml : `
            <div class="panel">
              <h3>My Checked-Out Assets</h3>
              <div class="empty-state">
                <div class="display">No assets checked out to you</div>
                Scan a barcode or browse the inventory to check out equipment.
              </div>
            </div>
          `}

          <div class="panel">
            <h3>Quick Actions</h3>
            <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px; line-height:1.4;">
              Access standard scanner and browser tools to manage your devices.
            </p>
            <div class="quick-actions" style="display:flex; flex-direction:column; gap:10px;">
              <button class="btn btn-primary" style="justify-content:center;" onclick="__app.goto('scan')">${iconScan()}Scan to Check Out</button>
              <button class="btn" style="justify-content:center;" onclick="__app.goto('inventory')">${iconList()}Browse Inventory List</button>
            </div>
          </div>
        </div>
      `;
    }

    // Admin Mode Dashboard
    const parentItems = items.filter(i => i.barcode.split('-').length <= 2);
    const total = parentItems.length;
    const checkedOut = parentItems.filter(i => i.status === 'out').length;
    const checkedIn = total - checkedOut;
    const totalQty = items.reduce((a,i)=>a+Number(i.quantity||0),0);

    const catCounts = {};
    items.forEach(i=>{ catCounts[i.category] = (catCounts[i.category]||0)+1; });
    const catEntries = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxCat = Math.max(1, ...catEntries.map(e=>e[1]));

    const recent = log.slice(0,6);

    return `
      <div class="topbar">
        <div>
          <div class="pagetitle">Dashboard</div>
          <div class="pagesub">Live overview of team-wide inventory</div>
        </div>
        <div class="stats-row">
          <div class="stat-chip"><div class="n">${total}</div><div class="l">Total Assets</div></div>
          <div class="stat-chip"><div class="n">${checkedIn}</div><div class="l">Checked In</div></div>
          <div class="stat-chip"><div class="n">${checkedOut}</div><div class="l">Checked Out</div></div>
          <div class="stat-chip"><div class="n">${totalQty}</div><div class="l">Total Qty</div></div>
        </div>
      </div>

      ${alertsHtml ? `<div style="margin-bottom:20px;">${alertsHtml}</div>` : ''}
      ${myAssetsHtml}

      <div class="dash-grid">
        <div class="panel">
          <h3>Recent Activity</h3>
          ${recent.length ? `<div class="log-list">${recent.map(logRowHtml).join('')}</div>` :
            `<div class="empty-state"><div class="display">No activity yet</div>Add or scan an item to get started.</div>`}
        </div>
        <div>
          <div class="panel" style="margin-bottom:16px;">
            <h3>By Category</h3>
            ${catEntries.length ? catEntries.map(([cat,n])=>`
              <div class="cat-bar-row">
                <div class="cn">${esc(cat)}</div>
                <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(n/maxCat*100).toFixed(0)}%"></div></div>
                <div class="cat-bar-n">${n}</div>
              </div>`).join('') : `<div style="font-size:13px;color:var(--ink-soft);">No items yet.</div>`}
          </div>
          <div class="panel">
            <h3>Quick Actions</h3>
            <div class="quick-actions">
              <button class="btn btn-primary" onclick="__app.openAddModal()">${iconPlus()}Add New Asset</button>
              <button class="btn" onclick="__app.goto('scan')">${iconScan()}Scan Barcode</button>
              <button class="btn" onclick="__app.goto('inventory')">${iconList()}View Inventory</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function logRowHtml(l){
    const dotClass = l.action==='checked-in'?'in':l.action==='checked-out'?'out':l.action==='added'?'add':l.action==='deleted'?'delete':'edit';
    const verb = {
      'checked-in':'checked in','checked-out':'checked out','added':'added','edited':'edited','deleted':'deleted'
    }[l.action] || l.action;

    const dateStr = new Date(l.ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `<div class="log-row" style="padding:14px 16px;">
      <div class="log-dot ${dotClass}"></div>
      <div class="log-main">
        <div class="t" style="font-size:13.5px;"><b>${esc(l.by)}</b> ${verb} <b>${esc(l.itemName||'an item')}</b></div>
        ${l.note ? `<div class="m" style="font-size:12px; margin-top:4px;">${esc(l.note)}</div>` : ''}
      </div>
      <div class="log-time" style="text-align:right; font-size:11.5px; line-height:1.4;">
        <span style="font-weight:600; display:block;">${timeAgo(l.ts)}</span>
        <span style="color:var(--ink-soft); font-size:10.5px; display:block; margin-top:2px;">${dateStr}</span>
      </div>
    </div>`;
  }

  /* ============ INVENTORY ============ */
  function getItemTotalQty(parentItem) {
    const prefix = parentItem.barcode + '-';
    const childrenCount = items.filter(i => i.barcode.startsWith(prefix) && i.status === 'out').length;
    return parentItem.quantity + childrenCount;
  }

  function getFilteredItems(){
    const q = searchQuery.trim().toLowerCase();
    let list = items.filter(i => i.barcode.split('-').length <= 2);
    
    if (currentUser && currentUser.role !== 'admin') {
      list = list.filter(i => i.visibleToUsers !== false);
    }
    
    return list.filter(i=>{
      const availableQty = i.status === 'out' ? 0 : i.quantity;
      const isAvailable = availableQty > 0;
      
      if(statusFilter==='in' && !isAvailable) return false;
      if(statusFilter==='out' && isAvailable) return false;
      if(categoryFilter!=='all' && i.category!==categoryFilter) return false;
      if(q && !(i.name.toLowerCase().includes(q) || i.barcode.toLowerCase().includes(q) || (i.department||'').toLowerCase().includes(q) || (i.assignedTo||'').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a,b)=> b.updatedAt - a.updatedAt);
  }

  function renderInventory(){
    const isAdmin = currentUser && currentUser.role === 'admin';
    return `
      <div class="topbar">
        <div>
          <div class="pagetitle">Inventory</div>
          <div class="pagesub">${items.filter(i => i.barcode.split('-').length <= 2).length} asset${items.filter(i => i.barcode.split('-').length <= 2).length===1?'':'s'} tracked</div>
        </div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="__app.openAddModal()">${iconPlus()}Add Asset</button>` : ''}
      </div>
      <div class="filterbar">
        <div class="search-wrap">
          ${iconSearch()}
          <input class="search-input" id="inv-search" placeholder="Search name, barcode, department, assignee…">
        </div>
        <select class="filter-select" id="inv-status-filter">
          <option value="all">All statuses</option>
          <option value="in">Checked in</option>
          <option value="out">Checked out</option>
        </select>
        <select class="filter-select" id="inv-cat-filter">
          <option value="all">All categories</option>
          ${CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div id="inv-list-container">${renderTagGrid(getFilteredItems())}</div>
    `;
  }

  function renderInventoryListOnly(){
    const c = document.getElementById('inv-list-container');
    if(c){ c.innerHTML = renderTagGrid(getFilteredItems()); }
    document.querySelectorAll('.asset-tag').forEach(el=>{
      el.addEventListener('click', ()=> openDetailModal(el.dataset.id));
    });
  }

  function renderTagGrid(list){
    if(!list.length){
      return `<div class="empty-state"><div class="display">No assets found</div>Try adjusting your filters, or add a new asset.</div>`;
    }
    return `<div class="tag-grid">${list.map(assetTagHtml).join('')}</div>`;
  }

  function assetTagHtml(i){
    const totalQty = getItemTotalQty(i);
    const availableQty = i.status === 'out' ? 0 : i.quantity;
    const isAvailable = availableQty > 0;
    
    const stripeClass = isAvailable ? 'in' : 'out';
    const statusText = isAvailable ? 'Available' : 'Checked Out';
    const statusStyle = isAvailable ? '' : 'color:#721c24; background-color:#f8d7da; border-color:#f5c6cb;';

    return `
      <div class="asset-tag" data-id="${i.id}">
        <div class="stripe ${stripeClass}"></div>
        <div class="asset-tag-body">
          <div class="rivet-hole"></div>
          <div class="status-pill ${stripeClass}" style="${statusStyle}">${statusText}</div>
          <div class="name">${esc(i.name)}</div>
          <div class="cat">${esc(i.category)}${i.department ? ' · '+esc(i.department) : ''}</div>
          <div class="code mono">${esc(i.barcode)}</div>
          <div class="tag-meta">
            <div>${esc(i.location||'—')}</div>
            <div class="qty">×${totalQty}</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ============ SCAN ============ */
  function renderScan(){
    const isBlocked = checkBlocked();
    if (isBlocked) {
      return `
        <div class="topbar">
          <div>
            <div class="pagetitle">Scan Barcode</div>
            <div class="pagesub">Scan asset codes for check-in</div>
          </div>
        </div>
        <div class="empty-state" style="border-color:var(--danger); background:var(--status-out-bg); padding:40px 20px;">
          <div class="display" style="color:var(--danger); font-size:18px; margin-bottom:8px;">Access Blocked</div>
          Your account has been blocked by the company administrator.<br>
          Please contact your administrator to restore scanner privileges.
        </div>
      `;
    }

    const isAdmin = currentUser && currentUser.role === 'admin';
    return `
      <div class="topbar">
        <div>
          <div class="pagetitle">Scan Barcode</div>
          <div class="pagesub">${isAdmin ? 'Use camera, or enter a code manually' : 'Scan a code to check-in/take possession of an asset'}</div>
        </div>
      </div>
      <div class="scan-panel">
        <div id="reader" style="display:none;"></div>
        <div id="scan-idle">
          ${iconScanBig()}
          <p style="color:var(--ink-soft); font-size:13.5px; margin:10px 0 18px 0;">Point your camera at an asset tag's QR code or barcode.</p>
          <button class="btn btn-primary" id="start-scan-btn">${iconScan()}Start Camera</button>
        </div>
        <button class="btn btn-danger" id="stop-scan-btn" style="display:none; margin-top:12px;">Stop Camera</button>
        <div class="scan-status" id="scan-status"></div>
        <div class="manual-entry">
          <label for="manual-code-input">Or enter code manually</label>
          <form id="manual-scan-form" class="manual-entry-row">
            <input type="text" id="manual-code-input" placeholder="e.g. AST-4F2K9" autocomplete="off">
            <button class="btn btn-primary" type="submit">Look Up</button>
          </form>
        </div>
      </div>
    `;
  }

  function startScanner(){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const readerEl = document.getElementById('reader');
    const idleEl = document.getElementById('scan-idle');
    const stopBtn = document.getElementById('stop-scan-btn');
    const statusEl = document.getElementById('scan-status');
    if(typeof Html5Qrcode === 'undefined'){
      statusEl.textContent = 'Scanner library failed to load. Use manual entry below.';
      return;
    }
    readerEl.style.display = 'block';
    idleEl.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    statusEl.textContent = 'Requesting camera access…';

    html5QrInstance = new Html5Qrcode('reader');
    Html5Qrcode.getCameras().then(cams=>{
      if(!cams || !cams.length){ throw new Error('no-camera'); }
      const camId = (cams.find(c=>/back|rear|environment/i.test(c.label)) || cams[cams.length-1]).id;
      return html5QrInstance.start(
        camId,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText)=>{
          statusEl.textContent = 'Code detected: ' + decodedText;
          handleScannedCode(decodedText);
          stopScanner();
        },
        ()=>{ /* per-frame decode errors, ignore */ }
      );
    }).then(()=>{
      statusEl.textContent = 'Scanning… hold the code steady in the frame.';
    }).catch(err=>{
      statusEl.textContent = 'Could not access camera. You can still enter the code manually below.';
      stopScanner();
    });
  }

  function stopScanner(){
    const readerEl = document.getElementById('reader');
    const idleEl = document.getElementById('scan-idle');
    const stopBtn = document.getElementById('stop-scan-btn');
    if(html5QrInstance){
      html5QrInstance.stop().then(()=>{
        html5QrInstance.clear();
        html5QrInstance = null;
      }).catch(()=>{ html5QrInstance = null; });
    }
    if(readerEl) readerEl.style.display = 'none';
    if(idleEl) idleEl.style.display = 'block';
    if(stopBtn) stopBtn.style.display = 'none';
  }

  async function handleScannedCode(code){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const item = items.find(i=> i.barcode.toLowerCase() === code.trim().toLowerCase());
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    if(item){
      if (!isAdmin) {
        if (item.status === 'in') {
          const isUserAdmin = !!(currentUser && currentUser.adminId);
          if (!isUserAdmin) {
            const categoryCount = items.filter(i => i.status === 'out' && i.assignedTo.toLowerCase() === currentUser.name.toLowerCase() && i.category === item.category).length;
            if (categoryCount >= 3) {
              showToast(`Limit exceeded: You already have 3 checked-out assets in the "${item.category}" category. Please return one first.`);
              return;
            }
          }
          await DbService.checkOut(item.id, currentUser.name, 'Self-checkout via scan');
          await DbService.loadAllData();
          showToast(`Asset "${item.name}" checked out to you successfully.`);
          openDetailModal(item.id);
          render();
        } else if (item.assignedTo === currentUser.name) {
          openDetailModal(item.id);
        } else {
          showToast(`This asset is currently checked out to ${item.assignedTo}.`);
          openDetailModal(item.id);
        }
      } else {
        openDetailModal(item.id);
      }
    }else{
      if (isAdmin) {
        openAddModal(code.trim());
        showToast('New barcode — fill in details to add this asset.');
      } else {
        showToast('Asset barcode not found in this company.');
      }
    }
  }

  /* ============ ACTIVITY LOG VIEW ============ */
  function renderLog(){
    const personalLog = log.filter(l => l.by && l.by.toLowerCase() === currentUser.name.toLowerCase());
    
    return `
      <div class="topbar">
        <div>
          <div class="pagetitle">Activity Log</div>
          <div class="pagesub">Track company-wide and personal asset events</div>
        </div>
      </div>
      
      <div class="panel" style="margin-bottom:24px;">
        <h3>Company Activity (${log.length})</h3>
        <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px; line-height:1.4;">
          A record of all additions, edits, check-outs, and returns for ${esc(currentUser.company)}.
        </p>
        ${log.length ? `<div class="log-list">${log.map(logRowHtml).join('')}</div>` :
          `<div class="empty-state"><div class="display">No company activity yet</div></div>`}
      </div>

      <div class="panel">
        <h3>My Personal Activity (${personalLog.length})</h3>
        <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px; line-height:1.4;">
          A record of your own check-outs, returns, and session updates.
        </p>
        ${personalLog.length ? `<div class="log-list">${personalLog.map(logRowHtml).join('')}</div>` :
          `<div class="empty-state"><div class="display">No personal activity yet</div>Start scanning or checking out assets to see your logs.</div>`}
      </div>
    `;
  }

  /* ============ EMPLOYEES VIEW (ADMIN ONLY) ============ */
  async function renderEmployees(){
    if (!currentUser || currentUser.role !== 'admin') return '';
    const employees = await DbService.getEmployees();
    const directory = await DbService.getDirectoryEmployees();
    
    let settingsHtml = '';
    if (isCompanyOwner()) {
      const certList = certifiedDesignations.length > 0 ? certifiedDesignations : DEFAULT_CERTIFIED;
      
      settingsHtml = `
        <div class="panel" style="margin-top:20px;">
          <h3>Certified Designations Settings</h3>
          <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px; line-height:1.4;">
            As the <strong>CEO / Chairperson</strong>, you can add or remove designations that are allowed to sign up in <strong>Admin Mode</strong> for ${esc(currentUser.company)}.
          </p>
          <div style="display:flex; gap:8px; margin-bottom:14px;">
            <input type="text" id="new-designation-input" placeholder="e.g. Manager, Lead, HOD" style="flex:1; padding:8px 10px; border:1px solid var(--line-strong); border-radius:6px; font-size:13.5px;">
            <button class="btn btn-primary btn-sm" onclick="__app.addCertifiedDesignation()">Add Designation</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${certList.map(d => `
              <span class="status-pill in" style="position:static; display:inline-flex; align-items:center; gap:6px; padding:5px 10px; font-size:11px; font-weight:600; text-transform:none; letter-spacing:normal;">
                ${esc(d)}
                ${certList.length > 1 ? `<span style="cursor:pointer; font-weight:700; color:var(--danger);" onclick="__app.removeCertifiedDesignation('${esc(d)}')">×</span>` : ''}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    const directoryRows = directory.map(e => `
      <tr>
        <td class="mono" style="font-weight:600;">${esc(e.officeId)}</td>
        <td><strong>${esc(e.name)}</strong></td>
        <td>${esc(e.designation)}</td>
        <td class="mono">${esc(e.officialPhone)}</td>
        <td>
          <span style="font-size:12px; color:var(--ink-soft); display:block;">${esc(e.email || '—')}</span>
          <span class="mono" style="font-size:11px; color:var(--ink-soft);">${esc(e.personalPhone || '')}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm" onclick="__app.openEditDirectoryModal('${e.id}')">${iconEdit()}</button>
            <button class="btn btn-sm btn-danger" onclick="__app.doDeleteDirectory('${e.id}')">${iconTrash()}</button>
          </div>
        </td>
      </tr>
    `).join('');

    const directoryTable = `
      <div class="panel" style="margin-top:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h3 style="margin:0;">Employee Whitelist Directory (${directory.length})</h3>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm" onclick="__app.openBulkImportModal()">${iconPlus()} Bulk Import</button>
            <button class="btn btn-primary btn-sm" onclick="__app.openAddDirectoryModal()">${iconPlus()} Add Employee</button>
          </div>
        </div>
        <p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px; line-height:1.4;">
          Only employees listed in this directory will be allowed to sign up. If their typed Office ID and Name do not match these records, their registration will be blocked.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Office ID</th>
                <th>Full Name</th>
                <th>Designation</th>
                <th>Official Phone</th>
                <th>Email / Personal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${directoryRows || `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--ink-soft);">No employees in directory. Click "Add Employee" or "Bulk Import" to start.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    return `
      <div class="topbar">
        <div>
          <div class="pagetitle">Employee Management</div>
          <div class="pagesub">Manage access permissions and directory whitelists for employees at ${esc(currentUser.company)}</div>
        </div>
      </div>
      
      <div class="panel">
        <h3>Active Signed-Up Users (${employees.length})</h3>
        <div class="log-list">
          ${employees.map(emp => `
            <div class="log-row" style="padding:16px;">
              <div class="log-dot ${emp.isBlocked ? 'delete' : 'in'}"></div>
              <div class="log-main">
                <div class="t" style="font-size:14.5px;">
                  <b>${esc(emp.name)}</b> 
                  <span style="font-size:12px; color:var(--ink-soft); font-weight:500;">— ${esc(emp.post)}</span>
                  ${emp.isBlocked ? `<span class="status-pill out" style="position:static; margin-left:8px; font-size:9px;">Blocked</span>` : `<span class="status-pill in" style="position:static; margin-left:8px; font-size:9px;">Active</span>`}
                </div>
                <div class="m" style="margin-top:6px; font-size:12px; line-height:1.5;">
                  Office ID: <span class="mono" style="font-weight:600; color:var(--ink);">${esc(emp.officeId)}</span> 
                  ${emp.adminId ? `· Admin ID: <span class="mono" style="font-weight:600; color:var(--accent-ink);">${esc(emp.adminId)}</span>` : ''}<br>
                  Email: <span class="mono">${esc(emp.email)}</span> · Personal Phone: <span class="mono">${esc(emp.personalPhone)}</span> · Official Phone: <span class="mono">${esc(emp.officialPhone)}</span>
                </div>
              </div>
              <div>
                ${emp.officeId.toLowerCase() === currentUser.officeId.toLowerCase() ? `
                  <span style="font-size:11px; color:var(--ink-faint); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Your Account</span>
                ` : `
                  <button class="btn btn-sm ${emp.isBlocked ? 'btn-primary' : 'btn-danger'}" onclick="__app.toggleBlockUser('${emp.officeId}')">
                    ${emp.isBlocked ? 'Unblock' : 'Block'}
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${directoryTable}
      ${settingsHtml}
    `;
  }

  async function toggleBlockUser(officeId) {
    if (!currentUser || currentUser.role !== 'admin') return;
    const result = await DbService.toggleBlockUser(officeId);
    if (result.success) {
      showToast(`User "${result.name}" is now ${result.isBlocked ? 'blocked' : 'unblocked'}.`);
      await DbService.loadAllData();
      render();
    }
  }

  async function addCertifiedDesignation() {
    if (!currentUser || !isCompanyOwner()) return;
    const input = document.getElementById('new-designation-input');
    const val = input ? input.value.trim() : '';
    if (!val) {
      showToast('Please enter a designation name.');
      return;
    }
    
    const certs = await DbService.getCertifiedDesignations();
    if (certs.some(d => d.toLowerCase() === val.toLowerCase())) {
      showToast('This designation is already certified.');
      return;
    }
    
    await DbService.addCertifiedDesignation(val);
    showToast(`Added "${val}" to certified designations.`);
    await DbService.loadAllData();
    render();
  }

  async function removeCertifiedDesignation(val) {
    if (!currentUser || !isCompanyOwner()) return;
    
    await DbService.removeCertifiedDesignation(val);
    showToast(`Removed "${val}" from certified designations.`);
    await DbService.loadAllData();
    render();
  }

  /* ============ MODALS ============ */
  function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

  function openAddDirectoryModal() {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head"><h3>Add Whitelist Employee</h3><button class="modal-close" onclick="__app.closeModal()">×</button></div>
          <div class="modal-body">
            <div class="field"><label for="d-office-id">Office ID</label><input id="d-office-id" placeholder="e.g. G-100400" required></div>
            <div class="field"><label for="d-name">Full Name</label><input id="d-name" placeholder="e.g. Sarah Connor" required></div>
            <div class="field"><label for="d-post">Designation</label><input id="d-post" placeholder="e.g. Specialist, HOD-Design" required></div>
            <div class="field">
              <label for="d-official-phone">Official Phone</label>
              <div style="display:flex; gap:6px;">
                <select id="d-official-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                  ${COUNTRIES.map(c => `<option value="${esc(c.code)}">${esc(c.code)}</option>`).join('')}
                </select>
                <input id="d-official-phone" placeholder="e.g. 98765 43210" style="flex:1;" required>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="d-personal-phone">Personal Phone (Optional)</label>
                <div style="display:flex; gap:6px;">
                  <select id="d-personal-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                    ${COUNTRIES.map(c => `<option value="${esc(c.code)}">${esc(c.code)}</option>`).join('')}
                  </select>
                  <input id="d-personal-phone" placeholder="e.g. 98765 43210" style="flex:1;">
                </div>
              </div>
              <div class="field"><label for="d-email">Email (Optional)</label><input id="d-email" type="email" placeholder="e.g. sarah@company.com"></div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" onclick="__app.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="__app.submitAddDirectory()">Add Employee</button>
          </div>
        </div>
      </div>
    `;

    const oSelect = document.getElementById('d-official-country');
    const oInput = document.getElementById('d-official-phone');
    if (oSelect && oInput) {
      oSelect.onchange = () => {
        const country = COUNTRIES.find(c => c.code === oSelect.value);
        if (country) oInput.placeholder = 'e.g. ' + country.placeholder;
      };
    }
    
    const pSelect = document.getElementById('d-personal-country');
    const pInput = document.getElementById('d-personal-phone');
    if (pSelect && pInput) {
      pSelect.onchange = () => {
        const country = COUNTRIES.find(c => c.code === pSelect.value);
        if (country) pInput.placeholder = 'e.g. ' + country.placeholder;
      };
    }

    document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  }

  async function submitAddDirectory() {
    const officeId = document.getElementById('d-office-id').value.trim();
    const name = document.getElementById('d-name').value.trim();
    const designation = document.getElementById('d-post').value.trim();
    
    const officialCountry = document.getElementById('d-official-country').value;
    const officialRaw = document.getElementById('d-official-phone').value.trim();
    const personalCountry = document.getElementById('d-personal-country').value;
    const personalRaw = document.getElementById('d-personal-phone').value.trim();
    
    const email = document.getElementById('d-email').value.trim();
    
    if (!officeId || !name || !designation || !officialRaw) {
      showToast('Please fill in all required fields.');
      return;
    }

    if (email && !isValidEmail(email)) {
      showToast('Please enter a valid email address.');
      return;
    }

    // Phone validations
    const oVal = validatePhone(officialRaw, officialCountry);
    if (!oVal.valid) {
      showToast(`Official Phone: ${oVal.message}`);
      return;
    }
    const officialPhone = officialCountry + oVal.cleaned;

    let personalPhone = '';
    if (personalRaw) {
      const pVal = validatePhone(personalRaw, personalCountry);
      if (!pVal.valid) {
        showToast(`Personal Phone: ${pVal.message}`);
        return;
      }
      personalPhone = personalCountry + pVal.cleaned;
    }
    
    const emp = {
      id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
      officeId, name, designation, officialPhone, personalPhone, email
    };
    
    const res = await DbService.addDirectoryEmployee(emp);
    if (res.success) {
      showToast('Employee added to directory.');
      await DbService.loadAllData();
      closeModal();
      render();
    } else {
      showToast('Error: ' + res.message);
    }
  }

  async function openEditDirectoryModal(id) {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const directory = await DbService.getDirectoryEmployees();
    const emp = directory.find(e => e.id === id);
    if (!emp) return;

    const officialParsed = parsePhoneAndCountry(emp.officialPhone);
    const personalParsed = parsePhoneAndCountry(emp.personalPhone);

    const officialCountry = COUNTRIES.find(c => c.code === officialParsed.countryCode) || COUNTRIES[0];
    const personalCountry = COUNTRIES.find(c => c.code === personalParsed.countryCode) || COUNTRIES[0];

    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head"><h3>Edit Whitelist Employee</h3><button class="modal-close" onclick="__app.closeModal()">×</button></div>
          <div class="modal-body">
            <div class="field"><label for="d-office-id">Office ID</label><input id="d-office-id" value="${esc(emp.officeId)}" required></div>
            <div class="field"><label for="d-name">Full Name</label><input id="d-name" value="${esc(emp.name)}" required></div>
            <div class="field"><label for="d-post">Designation</label><input id="d-post" value="${esc(emp.designation)}" required></div>
            <div class="field">
              <label for="d-official-phone">Official Phone</label>
              <div style="display:flex; gap:6px;">
                <select id="d-official-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                  ${COUNTRIES.map(c => `<option value="${esc(c.code)}" ${officialParsed.countryCode === c.code ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}
                </select>
                <input id="d-official-phone" placeholder="e.g. ${esc(officialCountry.placeholder)}" value="${esc(officialParsed.localNumber)}" style="flex:1;" required>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="d-personal-phone">Personal Phone (Optional)</label>
                <div style="display:flex; gap:6px;">
                  <select id="d-personal-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                    ${COUNTRIES.map(c => `<option value="${esc(c.code)}" ${personalParsed.countryCode === c.code ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}
                  </select>
                  <input id="d-personal-phone" placeholder="e.g. ${esc(personalCountry.placeholder)}" value="${esc(personalParsed.localNumber)}" style="flex:1;">
                </div>
              </div>
              <div class="field"><label for="d-email">Email (Optional)</label><input id="d-email" type="email" value="${esc(emp.email)}"></div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" onclick="__app.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="__app.submitEditDirectory('${emp.id}')">Save Changes</button>
          </div>
        </div>
      </div>
    `;

    const oSelect = document.getElementById('d-official-country');
    const oInput = document.getElementById('d-official-phone');
    if (oSelect && oInput) {
      oSelect.onchange = () => {
        const country = COUNTRIES.find(c => c.code === oSelect.value);
        if (country) oInput.placeholder = 'e.g. ' + country.placeholder;
      };
    }
    
    const pSelect = document.getElementById('d-personal-country');
    const pInput = document.getElementById('d-personal-phone');
    if (pSelect && pInput) {
      pSelect.onchange = () => {
        const country = COUNTRIES.find(c => c.code === pSelect.value);
        if (country) pInput.placeholder = 'e.g. ' + country.placeholder;
      };
    }

    document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  }

  async function submitEditDirectory(id) {
    const officeId = document.getElementById('d-office-id').value.trim();
    const name = document.getElementById('d-name').value.trim();
    const designation = document.getElementById('d-post').value.trim();
    
    const officialCountry = document.getElementById('d-official-country').value;
    const officialRaw = document.getElementById('d-official-phone').value.trim();
    const personalCountry = document.getElementById('d-personal-country').value;
    const personalRaw = document.getElementById('d-personal-phone').value.trim();
    
    const email = document.getElementById('d-email').value.trim();
    
    if (!officeId || !name || !designation || !officialRaw) {
      showToast('Please fill in all required fields.');
      return;
    }

    if (email && !isValidEmail(email)) {
      showToast('Please enter a valid email address.');
      return;
    }

    // Phone validations
    const oVal = validatePhone(officialRaw, officialCountry);
    if (!oVal.valid) {
      showToast(`Official Phone: ${oVal.message}`);
      return;
    }
    const officialPhone = officialCountry + oVal.cleaned;

    let personalPhone = '';
    if (personalRaw) {
      const pVal = validatePhone(personalRaw, personalCountry);
      if (!pVal.valid) {
        showToast(`Personal Phone: ${pVal.message}`);
        return;
      }
      personalPhone = personalCountry + pVal.cleaned;
    }
    
    const emp = {
      id, officeId, name, designation, officialPhone, personalPhone, email
    };
    
    const res = await DbService.updateDirectoryEmployee(emp);
    if (res.success) {
      showToast('Employee details updated in directory.');
      await DbService.loadAllData();
      closeModal();
      render();
    } else {
      showToast('Error: ' + res.message);
    }
  }

  function openBulkImportModal() {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head"><h3>Bulk Import Employees</h3><button class="modal-close" onclick="__app.closeModal()">×</button></div>
          <div class="modal-body">
            <div class="field">
              <label for="d-bulk-text">Paste Employee List</label>
              <textarea id="d-bulk-text" placeholder="OfficeID, Full Name, Designation, Official Phone, Email&#10;G-100200, John Doe, Developer, 011-234568, john@google.com&#10;G-100300, Jane Smith, Designer, 011-234569, jane@google.com" style="height:160px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; line-height:1.4; padding:8px;" required></textarea>
              <div class="field-hint" style="margin-top:6px;">Paste one employee per line. Separate fields with commas or tabs.</div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" onclick="__app.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="__app.submitBulkImport()">Import List</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  }

  async function submitBulkImport() {
    const text = document.getElementById('d-bulk-text').value.trim();
    if (!text) {
      showToast('Please paste employee list.');
      return;
    }
    
    let fallbackCountryCode = '+91';
    if (currentUser && currentUser.officialPhone) {
      const parsedAdminPhone = parsePhoneAndCountry(currentUser.officialPhone);
      fallbackCountryCode = parsedAdminPhone.countryCode;
    }

    const lines = text.split('\n');
    let imported = 0;
    let failed = 0;
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      if (line.toLowerCase().startsWith('officeid') || line.toLowerCase().startsWith('office id')) {
        continue;
      }
      
      const parts = line.split(/[,\t]/).map(p => p.trim());
      if (parts.length >= 4) {
        const officeId = parts[0];
        const name = parts[1];
        const designation = parts[2];
        const rawOfficialPhone = parts[3];
        const rawPersonalPhone = parts[4] || '';
        const email = parts[5] || '';
        
        if (!officeId || !name || !designation || !rawOfficialPhone) {
          failed++;
          continue;
        }

        if (email && !isValidEmail(email)) {
          failed++;
          continue;
        }

        const officialParsed = parsePhoneAndCountry(rawOfficialPhone.startsWith('+') ? rawOfficialPhone : fallbackCountryCode + rawOfficialPhone);
        const oVal = validatePhone(officialParsed.localNumber, officialParsed.countryCode);
        if (!oVal.valid) {
          failed++;
          continue;
        }
        const officialPhone = officialParsed.countryCode + oVal.cleaned;

        let personalPhone = '';
        if (rawPersonalPhone) {
          const personalParsed = parsePhoneAndCountry(rawPersonalPhone.startsWith('+') ? rawPersonalPhone : fallbackCountryCode + rawPersonalPhone);
          const pVal = validatePhone(personalParsed.localNumber, personalParsed.countryCode);
          if (!pVal.valid) {
            failed++;
            continue;
          }
          personalPhone = personalParsed.countryCode + pVal.cleaned;
        }

        const emp = {
          id: 'ed' + Date.now() + Math.random().toString(36).slice(2, 7),
          officeId,
          name,
          designation,
          officialPhone,
          personalPhone,
          email
        };
        
        const res = await DbService.addDirectoryEmployee(emp);
        if (res.success) {
          imported++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }
    
    showToast(`Bulk Import: Successfully imported ${imported} records. (${failed} skipped due to invalid data format).`);
    await DbService.loadAllData();
    closeModal();
    render();
  }

  async function doDeleteDirectory(id) {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    if (!confirm('Are you sure you want to remove this employee from the whitelist directory? New users with this ID will not be able to sign up.')) return;
    
    const res = await DbService.deleteDirectoryEmployee(id);
    if (res.success) {
      showToast('Employee removed from directory.');
      await DbService.loadAllData();
      render();
    } else {
      showToast('Error: ' + res.message);
    }
  }

  function openAddModal(prefillBarcode){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const barcode = prefillBarcode || uid('AST-');
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head"><h3>Add New Asset</h3><button class="modal-close" onclick="__app.closeModal()">×</button></div>
          <div class="modal-body">
            <div class="field"><label for="f-name">Asset Name</label><input id="f-name" placeholder="e.g. Dell Latitude 5540 Laptop"></div>
            <div class="field-row">
              <div class="field"><label for="f-category">Category</label>
                <select id="f-category">${CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
              </div>
              <div class="field"><label for="f-qty">Quantity</label><input id="f-qty" type="number" min="1" value="1"></div>
            </div>
            <div class="field">
              <label for="f-barcode">Barcode / Asset ID</label>
              <div class="inline-scan-btn">
                <input id="f-barcode" class="mono" value="${esc(barcode)}">
                <button class="btn btn-sm" type="button" onclick="__app.regenBarcode()">Generate</button>
              </div>
              <div class="field-hint">A QR tag for this code can be printed after saving.</div>
            </div>
            <div class="field-row">
              <div class="field"><label for="f-department">Department</label><input id="f-department" placeholder="e.g. Engineering"></div>
              <div class="field"><label for="f-location">Location</label><input id="f-location" placeholder="e.g. Building 2, Rack 4"></div>
            </div>
            <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" placeholder="Optional notes…"></textarea></div>
            <div class="field" style="display:flex; align-items:center; gap:8px; margin-top:10px;">
              <input type="checkbox" id="f-visible" checked style="width:auto; margin:0;">
              <label for="f-visible" style="margin:0; text-transform:none; font-size:13px; font-weight:500;">Visible to Users</label>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" onclick="__app.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="__app.submitAdd()">${iconPlus()}Add Asset</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') closeModal(); });
    setTimeout(()=>document.getElementById('f-name').focus(), 30);
  }

  function regenBarcode(){
    document.getElementById('f-barcode').value = uid('AST-');
  }

  async function submitAdd(){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const name = document.getElementById('f-name').value.trim();
    const barcode = document.getElementById('f-barcode').value.trim();
    if(!name){ showToast('Asset name is required.'); return; }
    if(!barcode){ showToast('Barcode / asset ID is required.'); return; }
    if(items.some(i=>i.barcode.toLowerCase()===barcode.toLowerCase())){ showToast('That barcode is already in use.'); return; }

    const isVisible = document.getElementById('f-visible') ? document.getElementById('f-visible').checked : true;

    const item = {
      id: uid('itm_'),
      name,
      category: document.getElementById('f-category').value,
      quantity: Math.max(1, parseInt(document.getElementById('f-qty').value)||1),
      barcode,
      department: document.getElementById('f-department').value.trim(),
      location: document.getElementById('f-location').value.trim(),
      notes: document.getElementById('f-notes').value.trim(),
      status: 'in',
      assignedTo: '',
      visibleToUsers: isVisible
    };
    
    await DbService.addItem(item);
    await DbService.loadAllData();
    
    closeModal();
    showToast('Asset added.');
    render();
  }

  function openDetailModal(id, fromDashboard){
    const item = items.find(i=>i.id===id);
    if(!item) return;

    const totalQty = getItemTotalQty(item);
    const availableQty = item.status === 'out' ? 0 : item.quantity;
    const isAvailable = availableQty > 0;

    const isBlocked = checkBlocked();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const isAssignedToMe = currentUser && item.assignedTo === currentUser.name;
    
    let actionHtml = '';
    let footerHtml = '';
    
    if (fromDashboard) {
      const daysLeft = item.expirationDate ? Math.ceil((item.expirationDate - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
      const daysLabel = daysLeft > 0 ? `${daysLeft} days left` : `Expired`;
      const canExtend = daysLeft <= 10;
      
      actionHtml = `
        <div style="border:1px solid var(--line-strong); border-radius:8px; padding:14px; background:var(--surface-alt); margin-bottom:14px;">
          <h4 style="margin:0 0 6px 0; font-size:13px; font-weight:600;">Extend Your Session</h4>
          <p style="font-size:12px; color:var(--ink-soft); margin:0 0 12px 0; line-height:1.4;">
            This asset is checked out under your name. Current expiration: <strong>${item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}</strong> (${daysLabel}).
          </p>
          <div class="field" style="margin-bottom:12px;">
            <label for="u-extend-months" style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em;">Extension Period</label>
            <select id="u-extend-months" style="padding:6px 10px; font-size:12.5px;">
              <option value="1">Extend by 1 Month</option>
              <option value="2">Extend by 2 Months</option>
              <option value="3">Extend by 3 Months</option>
            </select>
          </div>
          ${canExtend ? `
            <button class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:10px;" onclick="__app.extendAssetSession('${item.id}')">${iconSave()}Extend Session</button>
          ` : `
            <button class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:10px; opacity:0.5; cursor:not-allowed;" disabled>${iconSave()}Extend Session</button>
            <div style="font-size:11px; color:var(--ink-soft); text-align:center; margin-bottom:10px; margin-top:-6px;">Extension is available only in the last 10 days of your session.</div>
          `}
          <button class="btn btn-danger" style="width:100%; justify-content:center; background:var(--danger); border-color:var(--danger); color:#fff;" onclick="__app.doCheckIn('${item.id}')">${iconIn()}Return Asset (Check In)</button>
        </div>
      `;
      footerHtml = `
        <button class="btn" style="width:100%; justify-content:center;" onclick="__app.closeModal()">Close</button>
      `;
    } else {
      if (isAdmin) {
        if (isAvailable) {
          actionHtml = `
            <div style="border:1px solid var(--line-strong); border-radius:8px; padding:14px; background:var(--surface-alt); margin-bottom:14px;">
              <h4 style="margin:0 0 6px 0; font-size:13px; font-weight:600;">Check Out Asset</h4>
              <div class="field" style="margin-bottom:8px;"><label for="f-assign" style="font-size:11px; text-transform:uppercase;">Check out to (name)</label><input id="f-assign" value="${esc(currentUser.name)}" placeholder="Person or team" style="padding:8px 10px; font-size:12.5px;"></div>
              <div class="field" style="margin-bottom:12px;"><label for="f-checkout-note" style="font-size:11px; text-transform:uppercase;">Note (optional)</label><input id="f-checkout-note" placeholder="e.g. Site visit, returns Friday" style="padding:8px 10px; font-size:12.5px;"></div>
              <button class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:12px;" onclick="__app.doCheckOut('${item.id}')">${iconOut()}Check Out</button>
              <button class="btn" style="width:100%; justify-content:center; border-color:var(--accent); color:var(--accent); font-size:12.5px; padding:6px 12px;" onclick="__app.goto('scan'); __app.closeModal();">${iconScan()}Check Out using QR Code</button>
            </div>
          `;
        } else {
          actionHtml = `
            <div style="background:#f8d7da; color:#721c24; border:1px solid #f5c6cb; border-radius:8px; padding:12px; font-size:13px; text-align:center; font-weight:500;">
              This asset is not currently in stock or available.
            </div>
          `;
        }
        footerHtml = `
          <button class="btn btn-danger" onclick="__app.doDelete('${item.id}')">${iconTrash()}Delete</button>
          <button class="btn" onclick="__app.openEditModal('${item.id}')">${iconEdit()}Edit</button>
        `;
      } else {
        if (isBlocked) {
          actionHtml = `
            <div style="background:var(--status-out-bg); color:var(--status-out); border:1px solid var(--status-out); border-radius:6px; padding:10px; font-size:12px; text-align:center;">
              Your account has been blocked. Actions are disabled.
            </div>
          `;
        } else if (isAvailable) {
          actionHtml = `
            <div style="border:1px solid var(--line-strong); border-radius:8px; padding:14px; background:var(--surface-alt); margin-bottom:14px;">
              <h4 style="margin:0 0 6px 0; font-size:13px; font-weight:600;">Manual Check Out (Backup Option)</h4>
              <p style="font-size:12px; color:var(--ink-soft); margin:0 0 12px 0; line-height:1.4;">
                If the QR scanner is having trouble, confirm your Name and Office ID below to check out this asset manually.
              </p>
              <div class="field" style="margin-bottom:8px;">
                <label for="u-checkout-name" style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em;">Verify Full Name</label>
                <input id="u-checkout-name" placeholder="Enter your full name" style="padding:8px 10px; font-size:12.5px;">
              </div>
              <div class="field" style="margin-bottom:12px;">
                <label for="u-checkout-office-id" style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em;">Verify Office ID</label>
                <input id="u-checkout-office-id" placeholder="Enter your office ID" style="padding:8px 10px; font-size:12.5px; font-family:'IBM Plex Mono', monospace;">
              </div>
              <button class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:12px;" onclick="__app.doManualUserCheckOut('${item.id}')">${iconOut()}Manual Check Out</button>
              <button class="btn" style="width:100%; justify-content:center; border-color:var(--accent); color:var(--accent); font-size:12.5px; padding:6px 12px;" onclick="__app.goto('scan'); __app.closeModal();">${iconScan()}Check Out using QR Code</button>
            </div>
          `;
        } else {
          actionHtml = `
            <div style="background:#f8d7da; color:#721c24; border:1px solid #f5c6cb; border-radius:8px; padding:12px; font-size:13px; text-align:center; font-weight:500;">
              This asset is not currently in stock or available.
            </div>
          `;
        }
        footerHtml = `
          <button class="btn" style="width:100%; justify-content:center;" onclick="__app.closeModal()">Close</button>
        `;
      }
    }

    const statusText = isAvailable ? 'Available' : 'Checked Out';
    const statusStyle = isAvailable
      ? 'color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb;'
      : 'color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb;';

    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head">
            <h3>${esc(item.name)}</h3>
            <button class="modal-close" onclick="__app.closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="detail-status-row" style="margin-bottom:14px; display:flex; align-items:center; gap:8px;">
              <span class="status-pill" style="position:static; padding:4px 10px; font-size:12px; font-weight:600; border-radius:12px; ${statusStyle}">${statusText}</span>
              <span class="detail-code mono">${esc(item.barcode)}</span>
            </div>
            <div class="detail-grid">
              <div class="detail-item"><div class="l">Category</div><div class="v">${esc(item.category)}</div></div>
              ${fromDashboard ? `
                <div class="detail-item"><div class="l">Quantity</div><div class="v">1</div></div>
              ` : `
                <div class="detail-item"><div class="l">Total Quantity</div><div class="v">${totalQty}</div></div>
                <div class="detail-item"><div class="l">Available Quantity</div><div class="v">${availableQty}</div></div>
              `}
              <div class="detail-item"><div class="l">Department</div><div class="v">${esc(item.department)||'—'}</div></div>
              <div class="detail-item"><div class="l">Location</div><div class="v">${esc(item.location)||'—'}</div></div>
              ${fromDashboard ? `
                <div class="detail-item" style="grid-column:1/-1;"><div class="l">Checked out to</div><div class="v">${esc(item.assignedTo)||'—'}</div></div>
                <div class="detail-item"><div class="l">Checkout Date</div><div class="v">${item.checkedOutAt ? new Date(item.checkedOutAt).toLocaleDateString() : '—'}</div></div>
                <div class="detail-item"><div class="l">Expiration Date</div><div class="v" style="color:var(--danger); font-weight:600;">${item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}</div></div>
              ` : ''}
              ${item.notes ? `<div class="detail-item" style="grid-column:1/-1;"><div class="l">Notes</div><div class="v">${esc(item.notes)}</div></div>` : ''}
            </div>

            ${actionHtml}

            ${isAdmin ? `
              <div class="qr-wrap" style="text-align:center; margin-top:20px; background:var(--surface-alt); padding:16px; border-radius:12px; border:1px solid var(--line-strong);">
                <div id="qrcode-render" style="display:inline-block; padding:10px; background:#fff; border-radius:8px; border:1px solid var(--line-strong);"></div>
                <div style="font-size:11.5px; color:var(--ink-soft); margin-top:10px; font-weight:500;">Print this tag and attach it to the asset</div>
                <button class="btn btn-sm" style="margin-top:10px; font-size:11.5px; padding:4px 8px; justify-content:center; width:100%;" onclick="window.print()">Print QR Code</button>
              </div>
            ` : ''}
          </div>
          <div class="modal-foot">
            ${footerHtml}
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') closeModal(); });
    try{
      if(isAdmin && typeof QRCode !== 'undefined'){
        new QRCode(document.getElementById('qrcode-render'), { text: item.barcode, width: 116, height: 116, correctLevel: QRCode.CorrectLevel.M });
      }
    }catch(e){}
  }

  function openEditModal(id){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-head"><h3>Edit Asset</h3><button class="modal-close" onclick="__app.closeModal()">×</button></div>
          <div class="modal-body">
            <div class="field"><label for="f-name">Asset Name</label><input id="f-name" value="${esc(item.name)}"></div>
            <div class="field-row">
              <div class="field"><label for="f-category">Category</label>
                <select id="f-category">${CATEGORIES.map(c=>`<option value="${esc(c)}" ${c===item.category?'selected':''}>${esc(c)}</option>`).join('')}</select>
              </div>
              <div class="field"><label for="f-qty">Quantity</label><input id="f-qty" type="number" min="1" value="${esc(item.quantity)}"></div>
            </div>
            <div class="field"><label for="f-barcode">Barcode / Asset ID</label><input id="f-barcode" class="mono" value="${esc(item.barcode)}"></div>
            <div class="field-row">
              <div class="field"><label for="f-department">Department</label><input id="f-department" value="${esc(item.department)}"></div>
              <div class="field"><label for="f-location">Location</label><input id="f-location" value="${esc(item.location)}"></div>
            </div>
            <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes">${esc(item.notes)}</textarea></div>
            <div class="field" style="display:flex; align-items:center; gap:8px; margin-top:10px;">
              <input type="checkbox" id="f-visible" ${item.visibleToUsers !== false ? 'checked' : ''} style="width:auto; margin:0;">
              <label for="f-visible" style="margin:0; text-transform:none; font-size:13px; font-weight:500;">Visible to Users</label>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" onclick="__app.openDetailModal('${item.id}')">Back</button>
            <button class="btn btn-primary" onclick="__app.submitEdit('${item.id}')">${iconSave()}Save Changes</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') closeModal(); });
  }

  async function submitEdit(id){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    const name = document.getElementById('f-name').value.trim();
    const barcode = document.getElementById('f-barcode').value.trim();
    if(!name){ showToast('Asset name is required.'); return; }
    if(!barcode){ showToast('Barcode / asset ID is required.'); return; }
    if(items.some(i=>i.id!==id && i.barcode.toLowerCase()===barcode.toLowerCase())){ showToast('That barcode is already in use.'); return; }

    const isVisible = document.getElementById('f-visible') ? document.getElementById('f-visible').checked : true;

    const updatedItem = Object.assign({}, item, {
      name: name,
      category: document.getElementById('f-category').value,
      quantity: Math.max(1, parseInt(document.getElementById('f-qty').value)||1),
      barcode: barcode,
      department: document.getElementById('f-department').value.trim(),
      location: document.getElementById('f-location').value.trim(),
      notes: document.getElementById('f-notes').value.trim(),
      visibleToUsers: isVisible
    });

    await DbService.updateItem(updatedItem);
    await DbService.loadAllData();
    
    closeModal();
    showToast('Changes saved.');
    render();
  }

  async function doCheckOut(id){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      closeModal();
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    const assignEl = document.getElementById('f-assign');
    const noteEl = document.getElementById('f-checkout-note');
    const assignedTo = assignEl ? assignEl.value.trim() : '';
    if(!assignedTo){ showToast('Enter who this is being checked out to.'); return; }

    const activeEmployees = await DbService.getEmployees();
    const targetEmp = activeEmployees.find(e => e.name.toLowerCase() === assignedTo.toLowerCase());
    const isTargetAdmin = (targetEmp && (targetEmp.adminId || targetEmp.role === 'admin')) || (currentUser && currentUser.name.toLowerCase() === assignedTo.toLowerCase() && currentUser.role === 'admin');
    
    if (!isTargetAdmin) {
      const categoryCount = items.filter(i => i.status === 'out' && i.assignedTo.toLowerCase() === assignedTo.toLowerCase() && i.category === item.category).length;
      if (categoryCount >= 3) {
        showToast(`Limit exceeded: ${assignedTo} already has 3 checked-out assets in the "${item.category}" category.`);
        return;
      }
    }
    
    const note = noteEl && noteEl.value.trim() ? noteEl.value.trim() : '';
    await DbService.checkOut(id, assignedTo, note);
    await DbService.loadAllData();
    
    closeModal();
    showToast(item.name + ' checked out to ' + assignedTo + '.');
    render();
  }

  async function doManualUserCheckOut(id) {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      closeModal();
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    
    const typedName = document.getElementById('u-checkout-name').value.trim();
    const typedOfficeId = document.getElementById('u-checkout-office-id').value.trim();
    
    if (!typedName || !typedOfficeId) {
      showToast('Please enter both your Name and Office ID.');
      return;
    }
    
    if (typedName.toLowerCase() !== currentUser.name.toLowerCase() || typedOfficeId.toLowerCase() !== currentUser.officeId.toLowerCase()) {
      showToast('Error: Entered credentials do not match your current login session.');
      return;
    }

    const isUserAdmin = !!(currentUser && currentUser.adminId);
    if (!isUserAdmin) {
      const categoryCount = items.filter(i => i.status === 'out' && i.assignedTo.toLowerCase() === currentUser.name.toLowerCase() && i.category === item.category).length;
      if (categoryCount >= 3) {
        showToast(`Limit exceeded: You already have 3 checked-out assets in the "${item.category}" category. Please return one first.`);
        return;
      }
    }
    
    await DbService.checkOut(id, currentUser.name, 'Manual backup checkout via inventory');
    await DbService.loadAllData();
    
    closeModal();
    showToast(`Asset "${item.name}" checked out to you successfully.`);
    render();
  }

  async function extendAssetSession(id) {
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      closeModal();
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;

    // Check if within last 10 days
    const daysLeft = item.expirationDate ? Math.ceil((item.expirationDate - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    if (daysLeft > 10) {
      showToast('Action denied: Extensions are only allowed in the last 10 days.');
      return;
    }
    
    const extendSelect = document.getElementById('u-extend-months');
    const months = parseInt(extendSelect ? extendSelect.value : '1') || 1;
    
    // Calculate new expiration date
    const currentExp = item.expirationDate ? new Date(item.expirationDate) : new Date();
    currentExp.setMonth(currentExp.getMonth() + months);
    
    if (DbService.isSupabase) {
      await DbService.client.from('items').update({
        expiration_date: currentExp.toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', id);
    } else {
      item.expirationDate = currentExp.getTime();
      item.updatedAt = Date.now();
      await saveItems();
    }
    
    const logNote = `Extended session by ${months} month(s). New expiration: ${currentExp.toLocaleDateString()}`;
    await DbService.addLogEntry('edited', item, logNote);
    await DbService.loadAllData();
    
    closeModal();
    showToast(`Session for "${item.name}" extended by ${months} month(s).`);
    render();
  }

  async function doCheckIn(id){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      closeModal();
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    const returnedFrom = item.assignedTo;
    
    const isAdmin = currentUser && currentUser.role === 'admin';
    await DbService.checkIn(id, returnedFrom, !isAdmin);
    await DbService.loadAllData();
    
    if (isAdmin) {
      showToast(item.name + ' checked back in.');
    } else {
      showToast(`Asset "${item.name}" returned successfully.`);
    }
    
    closeModal();
    render();
  }

  async function doDelete(id){
    if (checkBlocked()) {
      showToast('Action denied: Your account is blocked.');
      return;
    }
    const item = items.find(i=>i.id===id);
    if(!item) return;
    if(!confirm('Delete "'+item.name+'"? This cannot be undone.')) return;
    
    await DbService.deleteItem(id);
    await DbService.loadAllData();
    
    closeModal();
    showToast('Asset deleted.');
    render();
  }

  /* ============ AUTH SUBMISSIONS & FLOWS ============ */
  function renderAuth() {
    const container = document.getElementById('auth-root');
    container.style.display = 'flex';
    
    if (authViewState === 'login') {
      container.innerHTML = `
        <div class="auth-card">
          <div class="auth-logo">
            <span class="rivet" style="width:12px; height:12px;"></span>
            <div class="display">Asset Track</div>
          </div>
          <div class="auth-title display">Sign In</div>
          <form id="login-form">
            <div class="field">
              <label for="login-office-id">Office ID / Admin ID</label>
              <input type="text" id="login-office-id" placeholder="e.g. G-100100 or admin-google" required autocomplete="username">
            </div>
            <div class="field">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:16px; padding:10px; font-weight:600;">
              Sign In
            </button>
          </form>
          <div style="margin-top:20px; font-size:13px; text-align:center; color:var(--ink-soft);">
            Don't have an account? <span class="auth-link" id="btn-go-signup">Sign Up</span>
          </div>
        </div>
      `;
      
      document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
      document.getElementById('btn-go-signup').onclick = async () => {
        authViewState = 'signup';
        signupStep = 1;
        signupData = {};
        
        container.innerHTML = `<div class="auth-card"><div style="text-align:center; font-size:14px; color:var(--ink-soft);">Loading available companies...</div></div>`;
        availableCompanies = await DbService.getCompanies();
        
        renderAuth();
      };
    } else if (authViewState === 'signup') {
      if (signupStep === 1) {
        const companiesList = availableCompanies.length > 0 ? availableCompanies : Object.keys(db.companies);
        const companyOptions = companiesList.map(c => `<option value="${esc(c)}" ${signupData.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
        const selectOther = signupData.company === 'Other' ? 'selected' : '';
        const otherStyle = signupData.company === 'Other' ? 'block' : 'none';

        const personalParsed = parsePhoneAndCountry(signupData.personalPhone || '');
        const officialParsed = parsePhoneAndCountry(signupData.officialPhone || '');
        
        const personalCountry = COUNTRIES.find(c => c.code === personalParsed.countryCode) || COUNTRIES[0];
        const officialCountry = COUNTRIES.find(c => c.code === officialParsed.countryCode) || COUNTRIES[0];
        
        const personalPlaceholder = personalCountry.placeholder;
        const officialPlaceholder = officialCountry.placeholder;
        
        container.innerHTML = `
          <div class="auth-card wide">
            <div class="auth-logo">
              <span class="rivet" style="width:12px; height:12px;"></span>
              <div class="display">Asset Track</div>
            </div>
            <div class="auth-title display">Create Account (Step 1/3)</div>
            <div style="font-size:12px; color:var(--ink-soft); margin-bottom:15px; text-align:center; text-transform:uppercase; letter-spacing:0.04em;">Basic Information</div>
            <form id="signup-step1-form">
              <div class="field">
                <label for="signup-name">Full Name</label>
                <input type="text" id="signup-name" placeholder="John Doe" value="${esc(signupData.name || '')}" required>
              </div>
              
              <div class="field-row">
                <div class="field">
                  <label for="signup-post">Designation / Post</label>
                  <input type="text" id="signup-post" placeholder="e.g. HOD, CEO, HOD-Design" value="${esc(signupData.post || '')}" required>
                  <div class="field-hint">Note: Only certified posts can request Admin Mode.</div>
                </div>
                <div class="field">
                  <label for="signup-office-id">Office ID</label>
                  <input type="text" id="signup-office-id" placeholder="Min 7 chars alphanumeric" value="${esc(signupData.officeId || '')}" required>
                </div>
              </div>
              
              <div class="field">
                <label for="signup-company">Company</label>
                <select id="signup-company">
                  ${companyOptions}
                  <option value="Other" ${selectOther}>Other (Register New Company)</option>
                </select>
              </div>
              
              <div class="field" id="signup-other-company-wrap" style="display:${otherStyle};">
                <label for="signup-other-company">Company Name</label>
                <input type="text" id="signup-other-company" placeholder="Enter Company Name" value="${esc(signupData.customCompany || '')}">
              </div>
              
              <div class="field-row">
                <div class="field">
                  <label for="signup-personal-phone">Personal Number</label>
                  <div style="display:flex; gap:6px;">
                    <select id="signup-personal-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                      ${COUNTRIES.map(c => `<option value="${esc(c.code)}" ${personalParsed.countryCode === c.code ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}
                    </select>
                    <input type="tel" id="signup-personal-phone" placeholder="e.g. ${esc(personalPlaceholder)}" value="${esc(personalParsed.localNumber)}" style="flex:1;" required>
                  </div>
                </div>
                <div class="field">
                  <label for="signup-official-phone">Official Number</label>
                  <div style="display:flex; gap:6px;">
                    <select id="signup-official-country" style="width:100px; padding:8px 6px; font-size:12.5px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface);">
                      ${COUNTRIES.map(c => `<option value="${esc(c.code)}" ${officialParsed.countryCode === c.code ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}
                    </select>
                    <input type="tel" id="signup-official-phone" placeholder="e.g. ${esc(officialPlaceholder)}" value="${esc(officialParsed.localNumber)}" style="flex:1;" required>
                  </div>
                </div>
              </div>
              
              <div class="field">
                <label for="signup-email">Professional Email ID</label>
                <input type="email" id="signup-email" placeholder="john@company.com" value="${esc(signupData.email || '')}" required>
              </div>
              
              <div class="field-row" style="margin-top:16px;">
                <button class="btn" type="button" id="btn-signup-cancel" style="flex:1; justify-content:center;">Cancel</button>
                <button class="btn btn-primary" type="submit" style="flex:1; justify-content:center;">Next</button>
              </div>
            </form>
          </div>
        `;
        
        const compSelect = document.getElementById('signup-company');
        const otherWrap = document.getElementById('signup-other-company-wrap');
        compSelect.onchange = () => {
          otherWrap.style.display = compSelect.value === 'Other' ? 'block' : 'none';
        };

        const pSelect = document.getElementById('signup-personal-country');
        const pInput = document.getElementById('signup-personal-phone');
        if (pSelect && pInput) {
          pSelect.onchange = () => {
            const country = COUNTRIES.find(c => c.code === pSelect.value);
            if (country) pInput.placeholder = 'e.g. ' + country.placeholder;
          };
        }
        
        const oSelect = document.getElementById('signup-official-country');
        const oInput = document.getElementById('signup-official-phone');
        if (oSelect && oInput) {
          oSelect.onchange = () => {
            const country = COUNTRIES.find(c => c.code === oSelect.value);
            if (country) oInput.placeholder = 'e.g. ' + country.placeholder;
          };
        }
        
        document.getElementById('signup-step1-form').addEventListener('submit', handleStep1Submit);
        document.getElementById('btn-signup-cancel').onclick = () => {
          authViewState = 'login';
          signupStep = 1;
          signupData = {};
          renderAuth();
        };
      } else if (signupStep === 2) {
        const isCertified = signupData.isCertified;
        const companyExists = signupData.companyExists;
        const directoryEmpty = signupData.directoryEmpty;
        const forceAdmin = !companyExists || directoryEmpty;
        const selectedRole = forceAdmin ? 'admin' : (signupData.role || 'user');
        
        let optionsHtml = '';
        if (forceAdmin) {
          optionsHtml = `
            <option value="user" disabled>User Mode (Blocked — Company directory empty)</option>
            <option value="admin" selected>Admin Mode (Register new company/directory)</option>
          `;
        } else {
          optionsHtml = `
            <option value="user" ${selectedRole === 'user' ? 'selected' : ''}>User Mode (Employee access)</option>
            <option value="admin" ${selectedRole === 'admin' ? 'selected' : ''} ${!isCertified ? 'disabled' : ''}>Admin Mode (Management access)</option>
          `;
        }
        
        let warningHtml = '';
        if (!companyExists) {
          warningHtml = `
            <div style="background:var(--status-out-bg); color:var(--status-out); border:1px solid var(--status-out); border-radius:6px; padding:10px; font-size:12px; margin-bottom:16px; line-height:1.4;">
              <strong>New Company Registration:</strong> The company <strong>"${esc(signupData.actualCompany)}"</strong> is not yet registered. You must sign up in <strong>Admin Mode</strong> to register it and upload the initial employee list.
            </div>
          `;
        } else if (directoryEmpty) {
          warningHtml = `
            <div style="background:var(--status-out-bg); color:var(--status-out); border:1px solid var(--status-out); border-radius:6px; padding:10px; font-size:12px; margin-bottom:16px; line-height:1.4;">
              <strong>Empty Company Directory:</strong> The company <strong>"${esc(signupData.actualCompany)}"</strong> is registered but has no employee records. An Admin must sign up first to upload the directory.
            </div>
          `;
        } else if (!isCertified) {
          warningHtml = `
            <div style="background:var(--status-out-bg); color:var(--status-out); border:1px solid var(--status-out); border-radius:6px; padding:10px; font-size:12px; margin-bottom:16px; line-height:1.4;">
              <strong>Access Restricted:</strong> Designation is not certified for Admin Mode privileges. Eligible posts must contain HOD, CEO, CFO, COO, Chairperson, President, Director, VP.
            </div>
          `;
        }

        let directoryUploadHtml = '';
        if (forceAdmin && directoryEmpty) {
          directoryUploadHtml = `
            <div class="field" style="margin-top:14px;">
              <label for="signup-dir-text">Upload Initial Employee Directory</label>
              <textarea id="signup-dir-text" placeholder="OfficeID, Full Name, Designation, Official Phone, Email&#10;G-100200, John Doe, Developer, 011-234568, john@google.com&#10;G-100300, Jane Smith, Designer, 011-234569, jane@google.com" style="height:120px; font-family:'IBM Plex Mono', monospace; font-size:12px; line-height:1.4; padding:8px;" required>${esc(signupData.initialDirectoryText || '')}</textarea>
              <div class="field-hint">Paste one employee per line, comma or tab-separated. You will be added to the whitelist automatically.</div>
            </div>
          `;
        }
        
        container.innerHTML = `
          <div class="auth-card">
            <div class="auth-logo">
              <span class="rivet" style="width:12px; height:12px;"></span>
              <div class="display">Asset Track</div>
            </div>
            <div class="auth-title display">Mode Selection (Step 2/3)</div>
            <div style="font-size:12px; color:var(--ink-soft); margin-bottom:15px; text-align:center; text-transform:uppercase; letter-spacing:0.04em;">Select Operating Mode</div>
            
            <form id="signup-step2-form">
              <div class="field">
                <label for="signup-role">Operating Mode</label>
                <select id="signup-role" style="font-weight:600;">
                  ${optionsHtml}
                </select>
                <div class="field-hint" style="margin-top:6px;">
                  Your designation: <strong>${esc(signupData.post)}</strong>
                </div>
              </div>
              
              ${warningHtml}
              ${directoryUploadHtml}
              
              <div class="field" id="admin-id-wrap" style="display:${selectedRole === 'admin' ? 'block' : 'none'};">
                <label for="signup-admin-id">Create Unique Admin ID</label>
                <input type="text" id="signup-admin-id" placeholder="Min 9 chars alphanumeric" value="${esc(signupData.adminId || '')}">
                <div class="field-hint">Used to log in to Admin Mode. Must be at least 9 characters alphanumeric.</div>
              </div>
              
              <div class="field-row" style="margin-top:16px;">
                <button class="btn" type="button" id="btn-step2-back" style="flex:1; justify-content:center;">Back</button>
                <button class="btn btn-primary" type="submit" style="flex:1; justify-content:center;">Next</button>
              </div>
            </form>
          </div>
        `;
        
        const roleSelect = document.getElementById('signup-role');
        const adminIdWrap = document.getElementById('admin-id-wrap');
        const adminIdInput = document.getElementById('signup-admin-id');
        
        roleSelect.onchange = () => {
          if (roleSelect.value === 'admin') {
            adminIdWrap.style.display = 'block';
            adminIdInput.setAttribute('required', 'true');
          } else {
            adminIdWrap.style.display = 'none';
            adminIdInput.removeAttribute('required');
          }
        };
        
        if (roleSelect.value === 'admin') {
          adminIdInput.setAttribute('required', 'true');
        }
        
        document.getElementById('signup-step2-form').addEventListener('submit', handleStep2Submit);
        document.getElementById('btn-step2-back').onclick = () => {
          signupStep = 1;
          renderAuth();
        };
      } else if (signupStep === 3) {
        container.innerHTML = `
          <div class="auth-card">
            <div class="auth-logo">
              <span class="rivet" style="width:12px; height:12px;"></span>
              <div class="display">Asset Track</div>
            </div>
            <div class="auth-title display">Security Setup (Step 3/3)</div>
            <div style="font-size:12px; color:var(--ink-soft); margin-bottom:15px; text-align:center; text-transform:uppercase; letter-spacing:0.04em;">Create Strong Password</div>
            
            <form id="signup-step3-form">
              <div class="field">
                <label for="signup-password">Password</label>
                <input type="password" id="signup-password" placeholder="••••••••" required>
                <div class="field-hint">Must be at least 8 characters long and contain both letters and numbers.</div>
              </div>
              
              <div class="field">
                <label for="signup-confirm-password">Confirm Password</label>
                <input type="password" id="signup-confirm-password" placeholder="••••••••" required>
              </div>
              
              <div class="field-row" style="margin-top:16px;">
                <button class="btn" type="button" id="btn-step3-back" style="flex:1; justify-content:center;">Back</button>
                <button class="btn btn-primary" type="submit" style="flex:1; justify-content:center;">Proceed to OTP</button>
              </div>
            </form>
          </div>
        `;
        
        document.getElementById('signup-step3-form').addEventListener('submit', handleStep3Submit);
        document.getElementById('btn-step3-back').onclick = () => {
          signupStep = 2;
          renderAuth();
        };
      }
    } else if (authViewState === 'otp') {
      container.innerHTML = `
        <div class="auth-card">
          <div class="auth-logo">
            <span class="rivet" style="width:12px; height:12px;"></span>
            <div class="display">Asset Track</div>
          </div>
          <div class="auth-title display">Verify Email & Phone</div>
          <p style="font-size:13px; color:var(--ink-soft); text-align:center; margin-bottom:16px; line-height:1.4;">
            A simulated OTP code has been sent to <br><strong>${esc(tempSignup.email)}</strong> and <strong>${esc(tempSignup.personalPhone)}</strong>.
          </p>
          
          <div style="background:var(--status-in-bg); color:var(--status-in); border:1px solid var(--status-in); border-radius:6px; padding:10px; font-size:12px; margin-bottom:20px; font-family:'IBM Plex Mono', monospace; text-align:center;">
            <strong>SIMULATOR NOTIFICATION:</strong><br>
            Your verification code is: <span style="font-weight:bold; font-size:14px; letter-spacing:1px;">${simulatedOtp}</span>
          </div>
          
          <form id="otp-form">
            <div class="field">
              <label for="otp-code">6-Digit Verification Code</label>
              <input type="text" id="otp-code" placeholder="123456" maxlength="6" required style="letter-spacing: 0.4em; text-align: center; font-size: 18px; font-family: 'IBM Plex Mono', monospace; font-weight:600;">
            </div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:16px; padding:10px; font-weight:600;">
              Verify & Complete Signup
            </button>
          </form>
          <div style="margin-top:20px; font-size:13px; text-align:center;">
            <span class="auth-link" id="btn-cancel-otp" style="color:var(--danger);">Cancel & Start Over</span>
          </div>
        </div>
      `;
      
      document.getElementById('otp-form').addEventListener('submit', handleOtpSubmit);
      document.getElementById('btn-cancel-otp').onclick = () => {
        tempSignup = null;
        simulatedOtp = '';
        authViewState = 'signup';
        signupStep = 1;
        signupData = {};
        renderAuth();
      };
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const loginId = document.getElementById('login-office-id').value.trim();
    const password = document.getElementById('login-password').value;
    
    document.getElementById('auth-root').innerHTML = `<div class="auth-card"><div style="text-align:center; font-size:14px; color:var(--ink-soft);">Authenticating...</div></div>`;
    
    const result = await DbService.login(loginId, password);
    if (!result.success) {
      authViewState = 'login';
      renderAuth();
      showToast(result.message);
      return;
    }
    
    saveSession(result.user);
    await DbService.loadAllData();
    
    currentView = result.user.role === 'admin' ? 'dashboard' : 'inventory';
    
    document.getElementById('auth-root').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    showToast(`Welcome back, ${result.user.name} (${result.user.role === 'admin' ? 'Admin Mode' : 'User Mode'})!`);
    render();
  }

  async function handleStep1Submit(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const post = document.getElementById('signup-post').value.trim();
    const officeId = document.getElementById('signup-office-id').value.trim();
    const companySelect = document.getElementById('signup-company').value;
    const otherCompany = document.getElementById('signup-other-company').value.trim();
    
    const personalCountry = document.getElementById('signup-personal-country').value;
    const personalRaw = document.getElementById('signup-personal-phone').value.trim();
    const officialCountry = document.getElementById('signup-official-country').value;
    const officialRaw = document.getElementById('signup-official-phone').value.trim();
    
    const email = document.getElementById('signup-email').value.trim();
    
    const company = companySelect === 'Other' ? otherCompany : companySelect;
    if (!company) {
      showToast('Company name is required.');
      return;
    }

    if (!/^[a-zA-Z0-9]{7,}$/.test(officeId)) {
      showToast('Office ID must be at least 7 characters (letters and numbers only).');
      return;
    }
    
    const exists = await DbService.isOfficeIdRegistered(officeId, company);
    if (exists) {
      showToast(`Office ID is already registered in ${company}.`);
      return;
    }

    // Phone validations
    const pVal = validatePhone(personalRaw, personalCountry);
    if (!pVal.valid) {
      showToast(`Personal Number: ${pVal.message}`);
      return;
    }
    const oVal = validatePhone(officialRaw, officialCountry);
    if (!oVal.valid) {
      showToast(`Official Number: ${oVal.message}`);
      return;
    }

    const personalPhone = personalCountry + pVal.cleaned;
    const officialPhone = officialCountry + oVal.cleaned;

    const phoneExists = await DbService.isPhoneRegistered(personalPhone, officialPhone, company);
    if (phoneExists) {
      showToast('One of the phone numbers is already registered to another user.');
      return;
    }
    
    if (!isValidEmail(email)) {
      showToast('Please enter a valid email address.');
      return;
    }
    
    signupData.name = name;
    signupData.post = post;
    signupData.officeId = officeId;
    signupData.company = companySelect;
    signupData.customCompany = otherCompany;
    signupData.actualCompany = company;
    signupData.personalPhone = personalPhone;
    signupData.officialPhone = officialPhone;
    signupData.email = email;
    
    const compList = await DbService.getCompanies();
    const companyExists = compList.some(c => c.toLowerCase() === company.toLowerCase());
    signupData.companyExists = companyExists;
    
    let isCertified = await DbService.checkDesignationCertified(post, company);
    let directoryEmpty = false;
    
    if (companyExists) {
      const directoryCount = await DbService.getCompanyDirectoryCount(company);
      if (directoryCount > 0) {
        const whitelisted = await DbService.checkDirectoryWhitelist(officeId, name, company);
        if (!whitelisted) {
          showToast(`Access Denied: Name & Office ID do not match the directory for "${company}".`);
          return;
        }
        // Overwrite with whitelisted details
        signupData.post = whitelisted.designation;
        isCertified = await DbService.checkDesignationCertified(whitelisted.designation, company);
      } else {
        directoryEmpty = true;
      }
    } else {
      directoryEmpty = true;
    }
    
    signupData.isCertified = isCertified;
    signupData.directoryEmpty = directoryEmpty;
    
    signupStep = 2;
    renderAuth();
  }

  async function handleStep2Submit(e) {
    e.preventDefault();
    const role = document.getElementById('signup-role').value;
    let adminId = '';
    let initialDirectoryText = '';
    
    if (role === 'admin') {
      adminId = document.getElementById('signup-admin-id').value.trim();
      if (!adminId) {
        showToast('Admin ID is required for Admin Mode.');
        return;
      }
      
      if (!/^[a-zA-Z0-9]{9,}$/.test(adminId)) {
        showToast('Unique Admin ID must be at least 9 characters (letters and numbers only).');
        return;
      }
      
      const isTaken = await DbService.isAdminIdRegistered(adminId);
      if (isTaken) {
        showToast('That Admin ID is already taken. Please choose another.');
        return;
      }

      if (signupData.directoryEmpty) {
        const dirEl = document.getElementById('signup-dir-text');
        if (dirEl) {
          initialDirectoryText = dirEl.value.trim();
          if (!initialDirectoryText) {
            showToast('Employee directory is required to register this company.');
            return;
          }
        }
      }
    }
    
    signupData.role = role;
    signupData.adminId = role === 'admin' ? adminId : '';
    signupData.initialDirectoryText = initialDirectoryText;
    
    signupStep = 3;
    renderAuth();
  }

  function handleStep3Submit(e) {
    e.preventDefault();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    if (password.length < 8) {
      showToast('Password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      showToast('Password must contain both letters and numbers.');
      return;
    }
    
    if (password !== confirmPassword) {
      showToast('Passwords do not match.');
      return;
    }
    
    signupData.password = password;
    
    tempSignup = {
      name: signupData.name,
      post: signupData.post,
      officeId: signupData.officeId,
      adminId: signupData.adminId || null,
      company: signupData.actualCompany,
      personalPhone: signupData.personalPhone,
      officialPhone: signupData.officialPhone,
      email: signupData.email,
      password: signupData.password,
      role: signupData.role,
      isBlocked: false,
      initialDirectoryText: signupData.initialDirectoryText || ''
    };
    
    simulatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    authViewState = 'otp';
    renderAuth();
    showToast('Verification code generated!');
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    const code = document.getElementById('otp-code').value.trim();
    if (code !== simulatedOtp) {
      showToast('Incorrect verification code. Please try again.');
      return;
    }
    
    document.getElementById('auth-root').innerHTML = `<div class="auth-card"><div style="text-align:center; font-size:14px; color:var(--ink-soft);">Creating account...</div></div>`;
    
    const signupResult = await DbService.signup(tempSignup);
    if (!signupResult.success) {
      authViewState = 'otp';
      renderAuth();
      showToast(signupResult.message);
      return;
    }
    
    saveSession(signupResult.user);
    await DbService.loadAllData();
    
    currentView = 'dashboard';
    
    tempSignup = null;
    simulatedOtp = '';
    
    document.getElementById('auth-root').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    showToast('Registration successful! Welcome to Asset Track.');
    render();
  }

  /* ============ ICONS ============ */
  function iconPlus(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`; }
  function iconScan(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V4a1 1 0 011-1h3M17 3h3a1 1 0 011 1v3M21 17v3a1 1 0 01-1 1h-3M7 21H4a1 1 0 01-1-1v-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`; }
  function iconScanBig(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="1.6" width="44" height="44"><path d="M3 7V4a1 1 0 011-1h3M17 3h3a1 1 0 011 1v3M21 17v3a1 1 0 01-1 1h-3M7 21H4a1 1 0 01-1-1v-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`; }
  function iconList(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
  function iconSearch(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`; }
  function iconOut(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`; }
  function iconIn(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="14 7 9 12 14 17"/><line x1="9" y1="12" x2="21" y2="12"/></svg>`; }
  function iconEdit(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>`; }
  function iconTrash(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`; }
  function iconSave(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`; }

  /* ============ NAV / INIT ============ */
  function goto(view){
    if (checkBlocked()) {
      showToast('Your account is blocked.');
      return;
    }
    currentView = view;
    if(view !== 'scan') stopScanner();
    render();
  }

  document.getElementById('navlist').addEventListener('click', e=>{
    const el = e.target.closest('.navitem');
    if(el) goto(el.dataset.view);
  });

  async function runSync() {
    if (!DbService.isSupabase) {
      showToast("Cannot sync: Supabase is not connected.");
      return;
    }
    showToast("Starting manual database sync...");
    const res = await DbService.migrateLocalToSupabase(true);
    if (res.success) {
      showToast("Sync successful! All local data uploaded.");
    } else {
      showToast("Sync failed: " + res.message);
      console.error("Manual sync failed:", res);
    }
  }

  window.__app = {
    goto, openAddModal, closeModal, regenBarcode, submitAdd,
    openDetailModal, openEditModal, submitEdit,
    doCheckOut, doCheckIn, doDelete, toggleBlockUser,
    addCertifiedDesignation, removeCertifiedDesignation, runSync,
    openAddDirectoryModal, submitAddDirectory, openEditDirectoryModal,
    submitEditDirectory, openBulkImportModal, submitBulkImport, doDeleteDirectory,
    doManualUserCheckOut, extendAssetSession
  };

  async function init(){
    document.getElementById('view-root').innerHTML = `<div class="empty-state"><div class="display">Loading inventory…</div></div>`;
    
    await DbService.init();
    loadSession();
    
    if (currentUser) {
      await DbService.loadAllData();
      if (checkBlocked()) {
        clearSession();
        document.getElementById('app').style.display = 'none';
        authViewState = 'login';
        renderAuth();
        showToast('Your account has been blocked by the admin.');
        return;
      }
      currentView = 'dashboard';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('auth-root').style.display = 'none';
      render();
    } else {
      document.getElementById('app').style.display = 'none';
      authViewState = 'login';
      renderAuth();
    }
  }

  init();
})();
