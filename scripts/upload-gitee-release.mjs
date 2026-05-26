#!/usr/bin/env node
/**
 * 上传 Windows 安装包到 Gitee Release（需 Gitee 私人令牌）
 * 用法: GITEE_TOKEN=xxx node scripts/upload-gitee-release.mjs [1.13.0]
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const versionArg = process.argv[2] || '1.13.0'
const version = versionArg.replace(/^v/, '')
const tag = `v${version}`
const token = process.env.GITEE_TOKEN
const owner = 'YanPro'
const repo = 'lyhermes'
const filePath = join(process.cwd(), 'dist', `LyHermes-Setup-${version}.exe`)

if (!token) {
  console.error('请设置环境变量 GITEE_TOKEN（Gitee 设置 → 私人令牌）')
  process.exit(1)
}
if (!existsSync(filePath)) {
  console.error(`未找到安装包: ${filePath}`)
  process.exit(1)
}

async function giteeJson(method, path, body) {
  const url = new URL(`https://gitee.com/api/v5/repos/${owner}/${repo}${path}`)
  url.searchParams.set('access_token', token)
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  let release = null
  try {
    release = await giteeJson('GET', `/releases/tags/${tag}`)
  } catch {
    release = null
  }

  if (!release?.id) {
    release = await giteeJson('POST', '/releases', {
      tag_name: tag,
      name: tag,
      body: `LyHermes ${tag} Windows 安装包（国内镜像）`,
      target_commitish: 'master',
    })
  }

  if (!release?.id) {
    throw new Error(`无法创建或获取 Gitee Release: ${tag}`)
  }

  const fileName = basename(filePath)
  if ((release.assets || []).some((item) => item.name === fileName)) {
    console.log(`Gitee Release ${tag} 已存在附件 ${fileName}`)
    return
  }

  const form = new FormData()
  form.append('file', new Blob([readFileSync(filePath)]), fileName)

  const uploadUrl = new URL(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/${release.id}/attach_files`,
  )
  uploadUrl.searchParams.set('access_token', token)
  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form })
  const uploadText = await uploadRes.text()
  if (!uploadRes.ok) {
    if (uploadText.includes('100 MB') || uploadText.includes('100MB')) {
      throw new Error(
        `Gitee 附件限制 100 MB，当前安装包过大。请改用 GitHub Release 或官网托管：${filePath}`,
      )
    }
    throw new Error(`upload failed: ${uploadRes.status} ${uploadText.slice(0, 300)}`)
  }
  console.log(`已上传到 Gitee Release ${tag}: ${fileName}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
