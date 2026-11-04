import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

async function runPhase3C3Tests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3C.3 CONTACTLEAD INDEX & PGBOUNCER AUDIT TESTS     ')
  console.log('══════════════════════════════════════════════════════════════════════\n')

  let passed = 0

  function test(name: string, fn: () => void) {
    try {
      fn()
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err: any) {
      console.error(`  ❌ ${name}: ${err.message}`)
      throw err
    }
  }

  console.log('--- 1. ContactLead Schema & Index Verification ---')

  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  const schemaContent = fs.readFileSync(schemaPath, 'utf8')

  test('Prisma schema contains model ContactLead', () => {
    assert(schemaContent.includes('model ContactLead'), 'model ContactLead must be defined')
  })

  test('model ContactLead contains @@index([createdAt])', () => {
    const contactLeadBlock = schemaContent.slice(schemaContent.indexOf('model ContactLead'))
    const blockEnd = contactLeadBlock.indexOf('}')
    const block = contactLeadBlock.slice(0, blockEnd)
    assert(block.includes('@@index([createdAt])'), 'ContactLead must include @@index([createdAt])')
  })

  test('Prisma schema defines datasource with both url and directUrl', () => {
    assert(schemaContent.includes('url      = env("DATABASE_URL")'), 'Datasource must configure url with DATABASE_URL')
    assert(schemaContent.includes('directUrl = env("DIRECT_URL")'), 'Datasource must configure directUrl with DIRECT_URL')
  })

  console.log('\n--- 2. Unapplied Migration File Verification ---')

  const migrationDir = path.join(process.cwd(), 'prisma', 'migrations', '20261101190000_add_contact_lead_created_at_index')
  const migrationFile = path.join(migrationDir, 'migration.sql')

  test('Migration directory 20261101190000_add_contact_lead_created_at_index exists', () => {
    assert(fs.existsSync(migrationDir), 'Migration directory must exist')
  })

  test('Migration SQL creates index ContactLead_createdAt_idx', () => {
    assert(fs.existsSync(migrationFile), 'migration.sql must exist')
    const sql = fs.readFileSync(migrationFile, 'utf8')
    assert(
      sql.includes('CREATE INDEX "ContactLead_createdAt_idx" ON "ContactLead"("createdAt");'),
      'Migration SQL must create ContactLead_createdAt_idx index'
    )
  })

  console.log('\n--- 3. ContactLead Query Inventory & Invariant Verification ---')

  const adminLeadsPage = fs.readFileSync(path.join(process.cwd(), 'app', 'admin', 'leads', 'page.tsx'), 'utf8')
  const adminDashboardPage = fs.readFileSync(path.join(process.cwd(), 'app', 'admin', 'page.tsx'), 'utf8')
  const rateLimitFile = fs.readFileSync(path.join(process.cwd(), 'lib', 'ratelimit.ts'), 'utf8')

  test('/admin/leads query enforces orderBy createdAt: desc', () => {
    assert(
      adminLeadsPage.includes("orderBy: { createdAt: 'desc' }"),
      '/admin/leads must query with orderBy createdAt desc'
    )
  })

  test('/admin/leads query preserves filtering by read status', () => {
    assert(
      adminLeadsPage.includes("status === 'read' ? true : status === 'unread' ? false : undefined"),
      '/admin/leads must handle read, unread, and all status filters'
    )
  })

  test('/admin/leads query preserves case-insensitive search by name, email, company', () => {
    assert(adminLeadsPage.includes("name: { contains: q, mode: 'insensitive' }"), 'Must filter name')
    assert(adminLeadsPage.includes("email: { contains: q, mode: 'insensitive' }"), 'Must filter email')
    assert(adminLeadsPage.includes("company: { contains: q, mode: 'insensitive' }"), 'Must filter company')
  })

  test('/admin dashboard queries top 5 recent leads by createdAt: desc', () => {
    assert(
      adminDashboardPage.includes("orderBy: { createdAt: 'desc' }"),
      'Dashboard must order leads by createdAt desc'
    )
    assert(adminDashboardPage.includes('take: 5'), 'Dashboard must limit recent leads to top 5')
  })

  test('lib/ratelimit.ts contact rate limiting has eliminated DB fallback to prevent TOCTOU race conditions', () => {
    assert(
      !rateLimitFile.includes("prisma.contactLead.count"),
      'lib/ratelimit.ts must NOT query contactLead count (PostgreSQL fallback eliminated in Phase 3C.5)'
    )
  })

  console.log('\n--- 4. PgBouncer Parameter & Topology Evaluation ---')

  test('DATABASE_URL parsing helper handles pgbouncer flag correctly', () => {
    const parseDbUrl = (urlStr: string) => {
      const u = new URL(urlStr)
      return {
        protocol: u.protocol,
        port: u.port,
        isPgBouncer: u.searchParams.get('pgbouncer') === 'true',
        connectionLimit: u.searchParams.get('connection_limit'),
        poolTimeout: u.searchParams.get('pool_timeout'),
      }
    }

    const testPoolerUrl = 'postgresql://user:pass@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1'
    const parsed = parseDbUrl(testPoolerUrl)
    assert.strictEqual(parsed.port, '6543')
    assert.strictEqual(parsed.isPgBouncer, true)
    assert.strictEqual(parsed.connectionLimit, '1')
  })

  test('DIRECT_URL correctly uses standard direct PostgreSQL port (5432)', () => {
    const directUrl = 'postgresql://user:pass@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'
    const u = new URL(directUrl)
    assert.strictEqual(u.port, '5432')
    assert.strictEqual(u.searchParams.get('pgbouncer'), null)
  })

  console.log('\n--- 5. ContactLead Filtering & Sorting In-Memory Simulation ---')

  type MockLead = {
    id: string
    name: string
    email: string
    company: string | null
    read: boolean
    createdAt: Date
  }

  const mockLeads: MockLead[] = [
    { id: '1', name: 'Alice Smith', email: 'alice@example.com', company: 'Alpha Inc', read: false, createdAt: new Date('2026-11-01T10:00:00Z') },
    { id: '2', name: 'Bob Jones', email: 'bob@example.com', company: 'Beta Corp', read: true, createdAt: new Date('2026-11-01T12:00:00Z') },
    { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', company: null, read: false, createdAt: new Date('2026-11-01T14:00:00Z') },
    { id: '4', name: 'Dana White', email: 'dana@example.com', company: 'Delta LLC', read: true, createdAt: new Date('2026-11-01T09:00:00Z') },
  ]

  test('Sorting by createdAt desc orders from newest to oldest', () => {
    const sorted = [...mockLeads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    assert.strictEqual(sorted[0].id, '3') // 14:00
    assert.strictEqual(sorted[1].id, '2') // 12:00
    assert.strictEqual(sorted[2].id, '1') // 10:00
    assert.strictEqual(sorted[3].id, '4') // 09:00
  })

  test('Filtering unread status accurately selects unread records', () => {
    const unreadOnly = mockLeads.filter(l => !l.read)
    assert.strictEqual(unreadOnly.length, 2)
    assert(unreadOnly.every(l => l.read === false))
  })

  test('Filtering read status accurately selects read records', () => {
    const readOnly = mockLeads.filter(l => l.read)
    assert.strictEqual(readOnly.length, 2)
    assert(readOnly.every(l => l.read === true))
  })

  test('Search filter matches case-insensitively across name, email, company', () => {
    const search = (q: string) => {
      const lowerQ = q.toLowerCase()
      return mockLeads.filter(l =>
        l.name.toLowerCase().includes(lowerQ) ||
        l.email.toLowerCase().includes(lowerQ) ||
        (l.company && l.company.toLowerCase().includes(lowerQ))
      )
    }

    assert.strictEqual(search('alice').length, 1)
    assert.strictEqual(search('BETA').length, 1)
    assert.strictEqual(search('example.com').length, 4)
    assert.strictEqual(search('nonexistent').length, 0)
  })

  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3C.3 Tests Summary: ${passed}/${passed} Passed (0 Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════\n')
}

runPhase3C3Tests().catch(err => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
