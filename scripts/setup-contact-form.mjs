#!/usr/bin/env node
/**
 * Configures VITE_GOOGLE_SCRIPT_URL in .env and verifies the deployment.
 *
 * Usage:
 *   npm run setup:contact
 *   npm run setup:contact -- "https://script.google.com/macros/s/.../exec"
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')
const gsPath = resolve(root, 'google-apps-script/ContactForm.gs')

const GOOGLE_SETUP = `
══════════════════════════════════════════════════════════════
  STEP 1 — Google Sheet
══════════════════════════════════════════════════════════════
  1. Open https://sheets.google.com → New spreadsheet
  2. Name it "4RinLabs Contact" (optional)

══════════════════════════════════════════════════════════════
  STEP 2 — Apps Script
══════════════════════════════════════════════════════════════
  1. In the sheet: Extensions → Apps Script
  2. Delete default code in Code.gs
  3. Paste ALL code from:
     ${gsPath}
  4. Save the project (Ctrl/Cmd + S)

══════════════════════════════════════════════════════════════
  STEP 3 — Run setupSheet (once)
══════════════════════════════════════════════════════════════
  1. Function dropdown → select "setupSheet"
  2. Click Run → Authorize → Allow
  3. Confirm alert: Submissions sheet is ready

══════════════════════════════════════════════════════════════
  STEP 4 — Deploy Web App
══════════════════════════════════════════════════════════════
  1. Deploy → New deployment → gear icon → Web app
  2. Execute as: Me
  3. Who has access: Anyone
  4. Deploy → Copy the Web app URL (must end with /exec)
`

function isValidExecUrl(url) {
  try {
    const u = new URL(url)
    return (
      u.hostname === 'script.google.com' &&
      u.pathname.includes('/macros/s/') &&
      u.pathname.endsWith('/exec')
    )
  } catch {
    return false
  }
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function testGet(url) {
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`GET returned non-JSON (${res.status}): ${text.slice(0, 120)}`)
  }
  if (!data.ok) {
    throw new Error(`GET ok:false — ${data.error || data.message || 'unknown'}`)
  }
  return data
}

async function testPost(url) {
  const payload = {
    name: 'Test User',
    email: 'test@4rinlabs.dev',
    contact: '+91 98765 43210',
    message: 'Automated setup test from 4RinLabs portfolio.',
    timestamp: new Date().toISOString(),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`POST returned non-JSON (${res.status}): ${text.slice(0, 120)}`)
  }
  if (!data.ok) {
    throw new Error(`POST ok:false — ${data.error || data.message || 'unknown'}`)
  }
  return data
}

async function main() {
  console.log('\n4RinLabs — Contact form → Google Sheets setup\n')

  let url = process.argv[2]?.trim()

  if (!url && existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^VITE_GOOGLE_SCRIPT_URL=(.+)$/m)
    const existing = match?.[1]?.trim()
    if (existing && !existing.includes('YOUR_')) {
      const reuse = await prompt(`Found existing URL in .env.\nUse it? (Y/n): `)
      if (!reuse || reuse.toLowerCase() === 'y') {
        url = existing
      }
    }
  }

  if (!url) {
    console.log(GOOGLE_SETUP)
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  STEP 5 — Paste your Web app URL here')
    console.log('══════════════════════════════════════════════════════════════\n')
    url = await prompt('Web app URL (/exec): ')
  }

  if (!isValidExecUrl(url)) {
    console.error('\nInvalid URL. It must look like:')
    console.error('https://script.google.com/macros/s/AKfycb.../exec\n')
    process.exit(1)
  }

  writeFileSync(envPath, `VITE_GOOGLE_SCRIPT_URL=${url}\n`, 'utf8')
  console.log(`\n✓ Wrote ${envPath}`)

  console.log('\nTesting deployment…')
  try {
    const getResult = await testGet(url)
    console.log('✓ GET:', getResult.message || 'endpoint live')
    await testPost(url)
    console.log('✓ POST: test row appended to Submissions sheet')
  } catch (err) {
    console.error('\n✗ Test failed:', err.message)
    console.error('\n.env was saved. Fix deployment (Anyone access, /exec URL) and run:')
    console.error('  npm run setup:contact -- "' + url + '"\n')
    process.exit(1)
  }

  console.log('\n✓ Setup complete!')
  console.log('  Restart dev server if running: Ctrl+C then npm run dev')
  console.log('  Check your Google Sheet → Submissions tab for the test row.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
