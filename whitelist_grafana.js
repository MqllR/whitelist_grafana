#!/usr/bin/env node

const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
const request = promisify(require('request'));

const grafana_url = 'https://grafana.com/api/hosted-grafana/source-ips';
const ipset_whitelist = 'grafana-whitelist';
const dest_port = 9091   // Authorized TCP port for grafana access

// Get the IP range from grafana
const ips_list = async () => {
  try {
    const ips = await request(grafana_url)
    return JSON.parse(ips['body'])
  }
  catch (e) {
    throw e
  }
}

const main = async () => {
  try {
    const ipset_list = await exec('ipset --list -t -n')
    if (! ipset_list.stdout.includes(ipset_whitelist)) {
      await exec(`ipset create ${ipset_whitelist} hash:ip family inet hashsize 1024`)
      console.log(`ipset created: ${ipset_whitelist}`)
    }
  } catch (e) {
	throw e
  }

  const iptables_rules =
	`DOCKER-USER -p tcp -m tcp --dport ${dest_port} \
	-m set ! --match-set ${ipset_whitelist} src -j DROP`

  try {
    const rules = await exec(`iptables -C ${iptables_rules}`)
    console.log('iptables rule already exist')
  }
  catch (e) {
    if ((e.code === 1) && (e.stderr.includes('rule exist'))) {
      await exec(`iptables -I ${iptables_rules}`)
      console.log('iptables rule added')
    } else {
      throw e
	}
  }

  const ips = await ips_list()
  const start = async () => {
  	return Promise.all(
  	  ips.map(async ip => {
  	    try {
  	  	  await exec(`ipset add ${ipset_whitelist} ${ip}`)
          console.log(`IP ${ip} is now whitelisted`)
  	    }
        catch (e) {
		  if ((e.code === 1) && (e.stderr.includes('already added'))) {
  	  	    console.log(`ipset IP ${ip} already exist`)
          } else {
			throw e
          }
  	    }
  	  })
  	)
  }
  await start()
}

main()
