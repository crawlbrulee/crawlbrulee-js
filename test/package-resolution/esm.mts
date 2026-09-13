import { Crawlbrulee, type CrawlbruleeOptions } from '@crawlbrulee/sdk'

const options: CrawlbruleeOptions = { apiKey: 'cwbl_esm_typecheck' }
const client = new Crawlbrulee(options)

void client
