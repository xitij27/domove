const { withGradleProperties } = require('expo/config-plugins');

// The template's 512m metaspace runs out on release builds, and Gradle then stops the daemon after every build.
// Only metaspace is raised: the heap was never the limit, and this has to fit an 8 GB dev machine.
const JVM_ARGS = '-Xmx2048m -XX:MaxMetaspaceSize=1024m';

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (cfg) => {
    const prop = cfg.modResults.find((item) => item.type === 'property' && item.key === 'org.gradle.jvmargs');
    if (prop) prop.value = JVM_ARGS;
    else cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return cfg;
  });
};
