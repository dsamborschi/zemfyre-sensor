/**
 * Test Trivy Security Scanner
 * 
 * Tests the Trivy integration by scanning known images.
 */

const { trivyScanner } = require('../dist/services/trivy-scanner');

async function testTrivyScanner() {
  console.log('🔍 Testing Trivy Security Scanner\n');
  console.log('=' .repeat(70));

  // Check if Trivy is available
  console.log('\n1. Checking Trivy availability...');
  const available = await trivyScanner.isAvailable();
  console.log(`   Trivy available: ${available ? '✅ Yes' : '❌ No'}`);

  if (!available) {
    console.log('\n⚠️  Trivy not installed or not in PATH');
    console.log('   Install: https://aquasecurity.github.io/trivy/');
    console.log('   Or set TRIVY_PATH=/path/to/trivy');
    return;
  }

  // Test images
  const testImages = [
    { name: 'alpine', tag: 'latest', description: 'Minimal Alpine Linux (usually clean)' },
    { name: 'redis', tag: '7.2-alpine', description: 'Redis on Alpine' },
    { name: 'nginx', tag: 'latest', description: 'Nginx (may have vulnerabilities)' },
  ];

  console.log('\n2. Scanning test images...\n');

  for (const image of testImages) {
    console.log(`\n📦 ${image.name}:${image.tag}`);
    console.log(`   ${image.description}`);
    console.log('   ' + '-'.repeat(60));

    try {
      const startTime = Date.now();
      const result = await trivyScanner.scanImage(image.name, image.tag);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`   ⏱️  Scan time: ${duration}s`);
      console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        continue;
      }

      const { vulnerabilities, scanStatus } = result;

      console.log(`   Scan result: ${scanStatus}`);
      console.log(`   Vulnerabilities:`);
      console.log(`     🔴 Critical: ${vulnerabilities.critical}`);
      console.log(`     🟠 High:     ${vulnerabilities.high}`);
      console.log(`     🟡 Medium:   ${vulnerabilities.medium}`);
      console.log(`     🟢 Low:      ${vulnerabilities.low}`);
      console.log(`     ⚪ Unknown:  ${vulnerabilities.unknown}`);
      console.log(`     📊 Total:    ${vulnerabilities.total}`);

      const summary = trivyScanner.getSecuritySummary(result);
      console.log(`\n   ${summary}`);

      // Show top 5 vulnerabilities if any
      if (result.details && result.details.length > 0) {
        console.log(`\n   Top vulnerabilities:`);
        result.details.slice(0, 5).forEach((vuln, idx) => {
          console.log(`     ${idx + 1}. ${vuln.VulnerabilityID} - ${vuln.Severity}`);
          console.log(`        Package: ${vuln.PkgName} (${vuln.InstalledVersion})`);
          console.log(`        Fix: ${vuln.FixedVersion}`);
        });
      }

    } catch (error) {
      console.log(`   ❌ Scan error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Trivy scanner test complete\n');
}

// Run tests
testTrivyScanner().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
