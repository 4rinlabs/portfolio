import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  setSessionForTesting,
  setAuthGuardForTesting,
  setUserLookupOverrideForTesting,
} from '../lib/auth-guard'
import {
  isPrismaRecordNotFoundError,
  handleMutationError,
} from '../lib/db-errors'
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
  toggleServiceActiveAction,
  createPortfolioAction,
  updatePortfolioAction,
  deletePortfolioAction,
  createBlogPostAction,
  updateBlogPostAction,
  deleteBlogPostAction,
  createProductAction,
  updateProductAction,
  deleteProductAction,
  toggleProductActiveAction,
  markLeadReadAction,
  markLeadUnreadAction,
  deleteLeadAction,
  ActionResult,
} from '../actions/admin'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✅ ${message}`)
  } else {
    failedTests++
    console.error(`  ❌ FAIL: ${message}`)
  }
}

function makePrismaKnownError(code: string, message: string = 'Prisma test error') {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '5.10.0',
  })
}

async function runPhase3CTests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3C.1 MUTATION RELIABILITY & ERROR HANDLING TESTS   ')
  console.log('══════════════════════════════════════════════════════════════════════')

  const nowSeconds = Math.floor(Date.now() / 1000)
  const adminUser = {
    id: 'admin-user-id',
    name: 'Admin User',
    email: 'admin@4rinlabs.com',
    role: 'ADMIN' as const,
    tokenVersion: 1,
    authTime: nowSeconds,
  }
  const editorUser = {
    id: 'editor-user-id',
    name: 'Editor User',
    email: 'editor@4rinlabs.com',
    role: 'EDITOR' as const,
    tokenVersion: 1,
    authTime: nowSeconds,
  }

  // Setup default database lookup mock for auth guards
  setUserLookupOverrideForTesting(async (id: string) => {
    if (id === 'admin-user-id') return adminUser
    if (id === 'editor-user-id') return editorUser
    return null
  })

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CENTRALIZED ERROR HANDLING HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Centralized Error Handling Helpers ---')

  const p2025Err = makePrismaKnownError('P2025', 'An operation failed because it depends on one or more records that were required but not found.')
  const p2002Err = makePrismaKnownError('P2002', 'Unique constraint failed on the constraint: BlogPost_slug_key')
  const genericDbErr = new Error('FATAL: connection to server at "db.supabase.co" (10.0.0.1) failed: Connection refused')
  const plainObject = { code: 'P2025', message: 'Fake error' }

  // 1.1 isPrismaRecordNotFoundError
  assert(isPrismaRecordNotFoundError(p2025Err) === true, 'isPrismaRecordNotFoundError returns true for Prisma P2025')
  assert(isPrismaRecordNotFoundError(p2002Err) === false, 'isPrismaRecordNotFoundError returns false for Prisma P2002')
  assert(isPrismaRecordNotFoundError(genericDbErr) === false, 'isPrismaRecordNotFoundError returns false for generic Error')
  assert(isPrismaRecordNotFoundError(plainObject) === false, 'isPrismaRecordNotFoundError returns false for plain object with code P2025')
  assert(isPrismaRecordNotFoundError(null) === false, 'isPrismaRecordNotFoundError returns false for null')
  assert(isPrismaRecordNotFoundError(undefined) === false, 'isPrismaRecordNotFoundError returns false for undefined')

  // 1.2 handleMutationError
  const resP2002 = handleMutationError(p2002Err, 'Service')
  assert(resP2002.success === false, 'P2002 returns success: false')
  assert(resP2002.message === 'A service with this slug already exists.', 'P2002 message mentions entity and slug')
  assert(Boolean(resP2002.errors?.slug?.length), 'P2002 provides field errors on slug')
  assert(!JSON.stringify(resP2002).includes('BlogPost_slug_key'), 'P2002 response does not leak internal constraint name')

  const resP2025 = handleMutationError(p2025Err, 'Blog post')
  assert(resP2025.success === false, 'P2025 returns success: false')
  assert(resP2025.message === 'This blog post no longer exists or was already removed.', 'P2025 message is clean and informative')
  assert(!JSON.stringify(resP2025).includes('An operation failed because it depends'), 'P2025 does not leak raw Prisma exception message')

  // 1.3 Unexpected Database Error Sanitization
  const resGeneric = handleMutationError(genericDbErr, 'Product')
  assert(resGeneric.success === false, 'Generic database error returns success: false')
  assert(resGeneric.message === 'A database error occurred. Please try again later.', 'Generic database error message is sanitized')
  assert(!JSON.stringify(resGeneric).includes('supabase.co'), 'Generic database error does not leak database hostname')
  assert(!JSON.stringify(resGeneric).includes('10.0.0.1'), 'Generic database error does not leak internal IP address')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: SERVICES MUTATIONS (CRUD & ERROR HANDLING)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Services Mutations ---')

  // 2.1 Unauthorized Create
  setSessionForTesting(null)
  const unauthSvcFd = new FormData()
  unauthSvcFd.append('name', 'Cloud Architecture')
  unauthSvcFd.append('slug', 'cloud-architecture')
  unauthSvcFd.append('shortDescription', 'Short description')
  unauthSvcFd.append('longDescription', 'Long description')
  const unauthCreateRes = await createServiceAction({ success: false }, unauthSvcFd)
  assert(unauthCreateRes.success === false && unauthCreateRes.message === 'Unauthorized: Authentication required', 'Unauthenticated createServiceAction is rejected')

  // 2.2 Authorized Create - Success
  setSessionForTesting({ user: editorUser })
  const origServiceFindUnique = prisma.service.findUnique
  const origServiceCreate = prisma.service.create
  const origServiceFindFirst = prisma.service.findFirst
  const origServiceUpdate = prisma.service.update
  const origServiceDelete = prisma.service.delete

  let createdServiceData: any = null
  ;(prisma.service as any).findUnique = async () => null
  ;(prisma.service as any).create = async ({ data }: any) => {
    createdServiceData = data
    return { id: 'svc-uuid-1', ...data }
  }

  const validSvcFd = new FormData()
  validSvcFd.append('name', 'Cloud Architecture')
  validSvcFd.append('slug', 'cloud-architecture')
  validSvcFd.append('shortDescription', 'Scalable cloud architecture')
  validSvcFd.append('longDescription', 'Deep dive into cloud architecture services')
  validSvcFd.append('featured', 'true')
  validSvcFd.append('active', 'true')
  validSvcFd.append('order', '1')

  const createRes = await createServiceAction({ success: false }, validSvcFd)
  assert(createRes.success === true && createRes.id === 'svc-uuid-1', 'createServiceAction succeeds with valid payload')
  assert(createdServiceData?.slug === 'cloud-architecture', 'createServiceAction correctly persists slug')

  // 2.3 Create - Duplicate slug detected via pre-check
  ;(prisma.service as any).findUnique = async () => ({ id: 'existing-id', slug: 'cloud-architecture' })
  const duplicatePreCheckRes = await createServiceAction({ success: false }, validSvcFd)
  assert(duplicatePreCheckRes.success === false && duplicatePreCheckRes.errors?.slug?.[0] === 'This slug is already in use', 'createServiceAction rejects duplicate slug via pre-check')

  // 2.4 Create - Duplicate slug caught via P2002 race condition fallback
  ;(prisma.service as any).findUnique = async () => null
  ;(prisma.service as any).create = async () => {
    throw makePrismaKnownError('P2002', 'Unique constraint failed on Service_slug_key')
  }
  const duplicateRaceRes = await createServiceAction({ success: false }, validSvcFd)
  assert(duplicateRaceRes.success === false && duplicateRaceRes.errors?.slug?.[0] === 'This slug is already in use. Please choose a different slug.', 'createServiceAction handles concurrent P2002 race condition gracefully')

  // 2.5 Create - Database failure sanitized
  ;(prisma.service as any).create = async () => {
    throw new Error('Connection lost to postgresql://service_user@db.internal:5432/db')
  }
  const createDbFailRes = await createServiceAction({ success: false }, validSvcFd)
  assert(createDbFailRes.success === false && createDbFailRes.message === 'A database error occurred. Please try again later.', 'createServiceAction sanitizes unexpected database failure')

  // 2.6 Update - Success
  let updatedServiceData: any = null
  ;(prisma.service as any).findFirst = async () => null
  ;(prisma.service as any).update = async ({ where, data }: any) => {
    updatedServiceData = { where, data }
    return { id: where.id, ...data }
  }

  const updateSvcFd = new FormData()
  updateSvcFd.append('id', 'svc-uuid-1')
  updateSvcFd.append('name', 'Cloud Architecture Advanced')
  updateSvcFd.append('slug', 'cloud-architecture')
  updateSvcFd.append('shortDescription', 'Updated short description')
  updateSvcFd.append('longDescription', 'Updated long description')
  const updateRes = await updateServiceAction({ success: false }, updateSvcFd)
  assert(updateRes.success === true && updateRes.message === 'Service updated', 'updateServiceAction succeeds with valid payload')
  assert(updatedServiceData?.where?.id === 'svc-uuid-1', 'updateServiceAction updates target record')

  // 2.7 Update - P2025 Missing Record
  ;(prisma.service as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  const updateP2025Res = await updateServiceAction({ success: false }, updateSvcFd)
  assert(updateP2025Res.success === false && updateP2025Res.message === 'This service no longer exists or was already removed.', 'updateServiceAction handles P2025 missing record gracefully')

  // 2.8 Update - P2002 Slug Collision
  ;(prisma.service as any).update = async () => {
    throw makePrismaKnownError('P2002', 'Unique constraint failed')
  }
  const updateP2002Res = await updateServiceAction({ success: false }, updateSvcFd)
  assert(updateP2002Res.success === false && Boolean(updateP2002Res.errors?.slug), 'updateServiceAction handles P2002 collision gracefully')

  // 2.9 Delete - Authorization (EDITOR forbidden, ADMIN allowed)
  setSessionForTesting({ user: editorUser })
  let editorDeleteThrew = false
  const delSvcFd = new FormData()
  delSvcFd.append('id', 'svc-uuid-1')
  try {
    await deleteServiceAction(delSvcFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorDeleteThrew = true
  }
  assert(editorDeleteThrew === true, 'EDITOR is prohibited from deleting services')

  setSessionForTesting({ user: adminUser })
  let deletedServiceCall: any = null
  let findUniqueCalledBeforeDelete = false
  ;(prisma.service as any).findUnique = async () => {
    findUniqueCalledBeforeDelete = true
    return { id: 'svc-uuid-1', slug: 'cloud-architecture' }
  }
  ;(prisma.service as any).delete = async (args: any) => {
    deletedServiceCall = args
    return { id: args.where.id, slug: 'cloud-architecture' }
  }

  await deleteServiceAction(delSvcFd)
  assert(deletedServiceCall?.where?.id === 'svc-uuid-1', 'ADMIN can delete service')
  assert(deletedServiceCall?.select?.slug === true, 'deleteServiceAction performs atomic delete selecting slug')
  assert(findUniqueCalledBeforeDelete === false, 'deleteServiceAction executes single atomic statement without preliminary findUnique')

  // 2.10 Delete - P2025 Idempotence (Record already deleted)
  ;(prisma.service as any).delete = async () => {
    throw makePrismaKnownError('P2025', 'Record to delete does not exist.')
  }
  let p2025Threw = false
  try {
    await deleteServiceAction(delSvcFd)
  } catch {
    p2025Threw = true
  }
  assert(p2025Threw === false, 'deleteServiceAction handles P2025 idempotently without throwing error')

  // 2.11 Toggle Service Active - Success & P2025 Idempotence
  let toggledData: any = null
  ;(prisma.service as any).update = async ({ where, data }: any) => {
    toggledData = { where, data }
    return { id: where.id, ...data }
  }
  const toggleFd = new FormData()
  toggleFd.append('id', 'svc-uuid-1')
  toggleFd.append('active', 'true')
  await toggleServiceActiveAction(toggleFd)
  assert(toggledData?.data?.active === false, 'toggleServiceActiveAction toggles true to false')

  ;(prisma.service as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  let toggleP2025Threw = false
  try {
    await toggleServiceActiveAction(toggleFd)
  } catch {
    toggleP2025Threw = true
  }
  assert(toggleP2025Threw === false, 'toggleServiceActiveAction handles P2025 idempotently without throwing error')

  // Restore prisma service mocks
  ;(prisma.service as any).findUnique = origServiceFindUnique
  ;(prisma.service as any).create = origServiceCreate
  ;(prisma.service as any).findFirst = origServiceFindFirst
  ;(prisma.service as any).update = origServiceUpdate
  ;(prisma.service as any).delete = origServiceDelete

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: PORTFOLIO MUTATIONS (CRUD & ERROR HANDLING)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Portfolio Mutations ---')

  const origPortFindUnique = prisma.portfolio.findUnique
  const origPortCreate = prisma.portfolio.create
  const origPortFindFirst = prisma.portfolio.findFirst
  const origPortUpdate = prisma.portfolio.update
  const origPortDelete = prisma.portfolio.delete

  setSessionForTesting({ user: editorUser })

  // 3.1 Create Portfolio - Success
  ;(prisma.portfolio as any).findUnique = async () => null
  ;(prisma.portfolio as any).create = async ({ data }: any) => {
    return { id: 'port-uuid-1', ...data }
  }

  const validPortFd = new FormData()
  validPortFd.append('title', 'NextGen AI Platform')
  validPortFd.append('slug', 'nextgen-ai-platform')
  validPortFd.append('description', 'A groundbreaking artificial intelligence platform')
  validPortFd.append('technologies', 'Next.js, TypeScript, PostgreSQL')
  validPortFd.append('gallery', 'https://images.unsplash.com/photo-1, https://images.unsplash.com/photo-2')

  const portCreateRes = await createPortfolioAction({ success: false }, validPortFd)
  assert(portCreateRes.success === true && portCreateRes.id === 'port-uuid-1', 'createPortfolioAction succeeds with valid payload')

  // 3.2 Create Portfolio - Duplicate Slug P2002
  ;(prisma.portfolio as any).create = async () => {
    throw makePrismaKnownError('P2002', 'Unique constraint failed on Portfolio_slug_key')
  }
  const portDupRes = await createPortfolioAction({ success: false }, validPortFd)
  assert(portDupRes.success === false && portDupRes.errors?.slug?.[0] === 'This slug is already in use. Please choose a different slug.', 'createPortfolioAction handles P2002 duplicate slug gracefully')

  // 3.3 Update Portfolio - P2025 Missing Record
  ;(prisma.portfolio as any).findFirst = async () => null
  ;(prisma.portfolio as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  const updatePortFd = new FormData()
  updatePortFd.append('id', 'port-uuid-1')
  updatePortFd.append('title', 'NextGen AI Platform Updated')
  updatePortFd.append('slug', 'nextgen-ai-platform')
  updatePortFd.append('description', 'Updated description for the platform')
  const portUpdP2025Res = await updatePortfolioAction({ success: false }, updatePortFd)
  assert(portUpdP2025Res.success === false && portUpdP2025Res.message === 'This project no longer exists or was already removed.', 'updatePortfolioAction handles P2025 missing record gracefully')

  // 3.4 Delete Portfolio - Authorization & Atomic Delete
  let editorPortDeleteThrew = false
  const delPortFd = new FormData()
  delPortFd.append('id', 'port-uuid-1')
  try {
    await deletePortfolioAction(delPortFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorPortDeleteThrew = true
  }
  assert(editorPortDeleteThrew === true, 'EDITOR cannot delete portfolio project')

  setSessionForTesting({ user: adminUser })
  let deletedPortCall: any = null
  let findUniqueCalledBeforePortDelete = false
  ;(prisma.portfolio as any).findUnique = async () => {
    findUniqueCalledBeforePortDelete = true
    return { id: 'port-uuid-1', slug: 'nextgen-ai-platform' }
  }
  ;(prisma.portfolio as any).delete = async (args: any) => {
    deletedPortCall = args
    return { id: args.where.id, slug: 'nextgen-ai-platform' }
  }
  await deletePortfolioAction(delPortFd)
  assert(deletedPortCall?.where?.id === 'port-uuid-1', 'ADMIN can delete portfolio project')
  assert(deletedPortCall?.select?.slug === true, 'deletePortfolioAction performs atomic delete selecting slug')
  assert(findUniqueCalledBeforePortDelete === false, 'deletePortfolioAction executes single atomic statement without findUnique')

  // 3.5 Delete Portfolio - P2025 Idempotence
  ;(prisma.portfolio as any).delete = async () => {
    throw makePrismaKnownError('P2025', 'Record does not exist.')
  }
  let portDeleteP2025Threw = false
  try {
    await deletePortfolioAction(delPortFd)
  } catch {
    portDeleteP2025Threw = true
  }
  assert(portDeleteP2025Threw === false, 'deletePortfolioAction handles P2025 idempotently without throwing error')

  // Restore prisma portfolio mocks
  ;(prisma.portfolio as any).findUnique = origPortFindUnique
  ;(prisma.portfolio as any).create = origPortCreate
  ;(prisma.portfolio as any).findFirst = origPortFindFirst
  ;(prisma.portfolio as any).update = origPortUpdate
  ;(prisma.portfolio as any).delete = origPortDelete

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: BLOG MUTATIONS & AUTHORSHIP POLICIES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Blog Mutations & Authorization Policies ---')

  const origBlogFindUnique = prisma.blogPost.findUnique
  const origBlogCreate = prisma.blogPost.create
  const origBlogFindFirst = prisma.blogPost.findFirst
  const origBlogUpdate = prisma.blogPost.update
  const origBlogDelete = prisma.blogPost.delete

  // 4.1 Create Blog Post - EDITOR creates post and authorId is set to editor's id
  setSessionForTesting({ user: editorUser })
  let createdBlogData: any = null
  ;(prisma.blogPost as any).findUnique = async () => null
  ;(prisma.blogPost as any).create = async ({ data }: any) => {
    createdBlogData = data
    return { id: 'blog-uuid-1', ...data }
  }

  const validBlogFd = new FormData()
  validBlogFd.append('title', 'Understanding Microservices')
  validBlogFd.append('slug', 'understanding-microservices')
  validBlogFd.append('content', 'Comprehensive guide to microservices architecture in enterprise applications.')
  validBlogFd.append('tags', 'architecture, microservices, cloud')
  validBlogFd.append('published', 'true')

  const blogCreateRes = await createBlogPostAction({ success: false }, validBlogFd)
  assert(blogCreateRes.success === true && blogCreateRes.id === 'blog-uuid-1', 'createBlogPostAction succeeds for EDITOR')
  assert(createdBlogData?.authorId === 'editor-user-id', 'createBlogPostAction sets authorId to current user id')
  assert(createdBlogData?.published === true, 'createBlogPostAction records published status')

  // 4.2 Create Blog Post - P2002 Duplicate Slug
  ;(prisma.blogPost as any).create = async () => {
    throw makePrismaKnownError('P2002', 'Unique constraint failed on BlogPost_slug_key')
  }
  const blogDupRes = await createBlogPostAction({ success: false }, validBlogFd)
  assert(blogDupRes.success === false && blogDupRes.errors?.slug?.[0] === 'This slug is already in use. Please choose a different slug.', 'createBlogPostAction handles P2002 duplicate slug gracefully')

  // 4.3 Update Blog Post - EDITOR edits post by another author (authorId must NOT change!)
  let updatedBlogData: any = null
  ;(prisma.blogPost as any).findFirst = async () => null
  ;(prisma.blogPost as any).findUnique = async () => ({
    id: 'blog-uuid-1',
    authorId: 'original-author-id',
    published: false,
    publishedAt: null,
  })
  ;(prisma.blogPost as any).update = async ({ where, data }: any) => {
    updatedBlogData = { where, data }
    return { id: where.id, ...data }
  }

  const editBlogFd = new FormData()
  editBlogFd.append('id', 'blog-uuid-1')
  editBlogFd.append('title', 'Understanding Microservices Revised')
  editBlogFd.append('slug', 'understanding-microservices')
  editBlogFd.append('content', 'Revised content with deeper explanations and updated diagrams.')
  editBlogFd.append('tags', 'architecture, cloud')
  editBlogFd.append('published', 'true')

  const blogUpdRes = await updateBlogPostAction({ success: false }, editBlogFd)
  assert(blogUpdRes.success === true && blogUpdRes.message === 'Post updated', 'EDITOR is permitted to update blog posts')
  assert(updatedBlogData?.data?.authorId === undefined, 'updateBlogPostAction NEVER modifies authorId (author immutability preserved)')

  // 4.4 Update Blog Post - P2025 Missing Record
  ;(prisma.blogPost as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  const blogUpdP2025Res = await updateBlogPostAction({ success: false }, editBlogFd)
  assert(blogUpdP2025Res.success === false && blogUpdP2025Res.message === 'This blog post no longer exists or was already removed.', 'updateBlogPostAction handles P2025 missing record gracefully')

  // 4.5 Delete Blog Post - EDITOR is strictly forbidden (ADMIN only!)
  const delBlogFd = new FormData()
  delBlogFd.append('id', 'blog-uuid-1')
  let editorBlogDeleteThrew = false
  try {
    await deleteBlogPostAction(delBlogFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorBlogDeleteThrew = true
  }
  assert(editorBlogDeleteThrew === true, 'EDITOR is strictly prohibited from deleting blog posts')

  // 4.6 Delete Blog Post - ADMIN can delete post atomically
  setSessionForTesting({ user: adminUser })
  let deletedBlogCall: any = null
  let findUniqueCalledBeforeBlogDelete = false
  ;(prisma.blogPost as any).findUnique = async () => {
    findUniqueCalledBeforeBlogDelete = true
    return { id: 'blog-uuid-1', slug: 'understanding-microservices' }
  }
  ;(prisma.blogPost as any).delete = async (args: any) => {
    deletedBlogCall = args
    return { id: args.where.id, slug: 'understanding-microservices' }
  }

  await deleteBlogPostAction(delBlogFd)
  assert(deletedBlogCall?.where?.id === 'blog-uuid-1', 'ADMIN is permitted to delete blog posts')
  assert(deletedBlogCall?.select?.slug === true, 'deleteBlogPostAction performs atomic delete selecting slug')
  assert(findUniqueCalledBeforeBlogDelete === false, 'deleteBlogPostAction executes single atomic statement without preliminary findUnique')

  // 4.7 Delete Blog Post - P2025 Idempotence
  ;(prisma.blogPost as any).delete = async () => {
    throw makePrismaKnownError('P2025', 'Record does not exist.')
  }
  let blogDeleteP2025Threw = false
  try {
    await deleteBlogPostAction(delBlogFd)
  } catch {
    blogDeleteP2025Threw = true
  }
  assert(blogDeleteP2025Threw === false, 'deleteBlogPostAction handles P2025 idempotently without throwing error')

  // Restore prisma blog mocks
  ;(prisma.blogPost as any).findUnique = origBlogFindUnique
  ;(prisma.blogPost as any).create = origBlogCreate
  ;(prisma.blogPost as any).findFirst = origBlogFindFirst
  ;(prisma.blogPost as any).update = origBlogUpdate
  ;(prisma.blogPost as any).delete = origBlogDelete

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PRODUCTS MUTATIONS (CRUD & ERROR HANDLING)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 5. Products Mutations ---')

  const origProdFindUnique = prisma.product.findUnique
  const origProdCreate = prisma.product.create
  const origProdFindFirst = prisma.product.findFirst
  const origProdUpdate = prisma.product.update
  const origProdDelete = prisma.product.delete

  setSessionForTesting({ user: editorUser })

  // 5.1 Create Product - Success
  ;(prisma.product as any).findUnique = async () => null
  ;(prisma.product as any).create = async ({ data }: any) => {
    return { id: 'prod-uuid-1', ...data }
  }

  const validProdFd = new FormData()
  validProdFd.append('name', 'CloudGuard Pro')
  validProdFd.append('slug', 'cloudguard-pro')
  validProdFd.append('tagline', 'Next-generation cloud security suite')
  validProdFd.append('description', 'Comprehensive automated cloud posture management and security monitoring.')
  validProdFd.append('tags', 'security, compliance, cloud')
  validProdFd.append('featured', 'true')
  validProdFd.append('active', 'true')

  const prodCreateRes = await createProductAction({ success: false }, validProdFd)
  assert(prodCreateRes.success === true && prodCreateRes.id === 'prod-uuid-1', 'createProductAction succeeds with valid payload')

  // 5.2 Create Product - P2002 Duplicate Slug
  ;(prisma.product as any).create = async () => {
    throw makePrismaKnownError('P2002', 'Unique constraint failed on Product_slug_key')
  }
  const prodDupRes = await createProductAction({ success: false }, validProdFd)
  assert(prodDupRes.success === false && prodDupRes.errors?.slug?.[0] === 'This slug is already in use. Please choose a different slug.', 'createProductAction handles P2002 duplicate slug gracefully')

  // 5.3 Update Product - P2025 Missing Record
  ;(prisma.product as any).findFirst = async () => null
  ;(prisma.product as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  const updateProdFd = new FormData()
  updateProdFd.append('id', 'prod-uuid-1')
  updateProdFd.append('name', 'CloudGuard Pro Updated')
  updateProdFd.append('slug', 'cloudguard-pro')
  updateProdFd.append('tagline', 'Updated tagline')
  updateProdFd.append('description', 'Updated description')
  const prodUpdP2025Res = await updateProductAction({ success: false }, updateProdFd)
  assert(prodUpdP2025Res.success === false && prodUpdP2025Res.message === 'This product no longer exists or was already removed.', 'updateProductAction handles P2025 missing record gracefully')

  // 5.4 Delete Product - Authorization & Atomic Delete
  const delProdFd = new FormData()
  delProdFd.append('id', 'prod-uuid-1')
  let editorProdDeleteThrew = false
  try {
    await deleteProductAction(delProdFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorProdDeleteThrew = true
  }
  assert(editorProdDeleteThrew === true, 'EDITOR is prohibited from deleting products')

  setSessionForTesting({ user: adminUser })
  let deletedProdCall: any = null
  let findUniqueCalledBeforeProdDelete = false
  ;(prisma.product as any).findUnique = async () => {
    findUniqueCalledBeforeProdDelete = true
    return { id: 'prod-uuid-1', slug: 'cloudguard-pro' }
  }
  ;(prisma.product as any).delete = async (args: any) => {
    deletedProdCall = args
    return { id: args.where.id, slug: 'cloudguard-pro' }
  }

  await deleteProductAction(delProdFd)
  assert(deletedProdCall?.where?.id === 'prod-uuid-1', 'ADMIN can delete product')
  assert(deletedProdCall?.select?.slug === true, 'deleteProductAction performs atomic delete selecting slug')
  assert(findUniqueCalledBeforeProdDelete === false, 'deleteProductAction executes single atomic statement without findUnique')

  // 5.5 Delete Product - P2025 Idempotence
  ;(prisma.product as any).delete = async () => {
    throw makePrismaKnownError('P2025', 'Record does not exist.')
  }
  let prodDeleteP2025Threw = false
  try {
    await deleteProductAction(delProdFd)
  } catch {
    prodDeleteP2025Threw = true
  }
  assert(prodDeleteP2025Threw === false, 'deleteProductAction handles P2025 idempotently without throwing error')

  // 5.6 Toggle Product Active - Success & P2025 Idempotence
  let toggledProdData: any = null
  ;(prisma.product as any).update = async ({ where, data }: any) => {
    toggledProdData = { where, data }
    return { id: where.id, ...data }
  }
  const toggleProdFd = new FormData()
  toggleProdFd.append('id', 'prod-uuid-1')
  toggleProdFd.append('active', 'true')
  await toggleProductActiveAction(toggleProdFd)
  assert(toggledProdData?.data?.active === false, 'toggleProductActiveAction toggles true to false')

  ;(prisma.product as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Record not found')
  }
  let toggleProdP2025Threw = false
  try {
    await toggleProductActiveAction(toggleProdFd)
  } catch {
    toggleProdP2025Threw = true
  }
  assert(toggleProdP2025Threw === false, 'toggleProductActiveAction handles P2025 idempotently without throwing error')

  // Restore prisma product mocks
  ;(prisma.product as any).findUnique = origProdFindUnique
  ;(prisma.product as any).create = origProdCreate
  ;(prisma.product as any).findFirst = origProdFindFirst
  ;(prisma.product as any).update = origProdUpdate
  ;(prisma.product as any).delete = origProdDelete

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6: CONTACT LEADS MUTATIONS (CRUD & ERROR HANDLING)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 6. Leads Mutations ---')

  const origLeadUpdate = prisma.contactLead.update
  const origLeadDelete = prisma.contactLead.delete

  const leadFd = new FormData()
  leadFd.append('id', 'lead-uuid-1')

  // 6.1 Mark Read - Authorization (EDITOR forbidden, ADMIN allowed)
  setSessionForTesting({ user: editorUser })
  let editorMarkReadThrew = false
  try {
    await markLeadReadAction(leadFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorMarkReadThrew = true
  }
  assert(editorMarkReadThrew === true, 'EDITOR is prohibited from marking leads as read')

  setSessionForTesting({ user: adminUser })
  let leadUpdatedData: any = null
  ;(prisma.contactLead as any).update = async ({ where, data }: any) => {
    leadUpdatedData = { where, data }
    return { id: where.id, ...data }
  }
  await markLeadReadAction(leadFd)
  assert(leadUpdatedData?.where?.id === 'lead-uuid-1' && leadUpdatedData?.data?.read === true, 'ADMIN can mark lead as read')

  // 6.2 Mark Read - P2025 Idempotence
  ;(prisma.contactLead as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Lead not found')
  }
  let leadReadP2025Threw = false
  try {
    await markLeadReadAction(leadFd)
  } catch {
    leadReadP2025Threw = true
  }
  assert(leadReadP2025Threw === false, 'markLeadReadAction handles P2025 idempotently without throwing error')

  // 6.3 Mark Unread - Success & P2025 Idempotence
  ;(prisma.contactLead as any).update = async ({ where, data }: any) => {
    leadUpdatedData = { where, data }
    return { id: where.id, ...data }
  }
  await markLeadUnreadAction(leadFd)
  assert(leadUpdatedData?.where?.id === 'lead-uuid-1' && leadUpdatedData?.data?.read === false, 'ADMIN can mark lead as unread')

  ;(prisma.contactLead as any).update = async () => {
    throw makePrismaKnownError('P2025', 'Lead not found')
  }
  let leadUnreadP2025Threw = false
  try {
    await markLeadUnreadAction(leadFd)
  } catch {
    leadUnreadP2025Threw = true
  }
  assert(leadUnreadP2025Threw === false, 'markLeadUnreadAction handles P2025 idempotently without throwing error')

  // 6.4 Delete Lead - Authorization (EDITOR forbidden, ADMIN allowed)
  setSessionForTesting({ user: editorUser })
  let editorLeadDeleteThrew = false
  try {
    await deleteLeadAction(leadFd)
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) editorLeadDeleteThrew = true
  }
  assert(editorLeadDeleteThrew === true, 'EDITOR is prohibited from deleting leads')

  setSessionForTesting({ user: adminUser })
  let leadDeletedCall: any = null
  ;(prisma.contactLead as any).delete = async (args: any) => {
    leadDeletedCall = args
    return { id: args.where.id }
  }
  await deleteLeadAction(leadFd)
  assert(leadDeletedCall?.where?.id === 'lead-uuid-1', 'ADMIN can delete contact lead')

  // 6.5 Delete Lead - P2025 Idempotence
  ;(prisma.contactLead as any).delete = async () => {
    throw makePrismaKnownError('P2025', 'Lead does not exist')
  }
  let leadDeleteP2025Threw = false
  try {
    await deleteLeadAction(leadFd)
  } catch {
    leadDeleteP2025Threw = true
  }
  assert(leadDeleteP2025Threw === false, 'deleteLeadAction handles P2025 idempotently without throwing error')

  // Restore prisma lead mocks
  ;(prisma.contactLead as any).update = origLeadUpdate
  ;(prisma.contactLead as any).delete = origLeadDelete

  // Teardown auth guards
  setSessionForTesting(null)
  setAuthGuardForTesting(null)
  setUserLookupOverrideForTesting(null)

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3C.1 Tests Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase3CTests().catch((err) => {
  console.error('Test runner fatal error:', err)
  process.exit(1)
})
