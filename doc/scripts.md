Setup and Cleanup Scripts
-------------------------

The Perflab supports running a user specified script before and
after each run of tests, and before and after each individual test.

The following environment variables are available:

<dl>

<dt>PERFLAB_PHASE</dt>
<dd> the test phase (useful if you have a single script)<br/>
(pre-run|post-run|pre-test|post-test)
</dd>

<dt>PERFLAB_CONFIG_PATH</dt>
<dd>the path that is the base output directory for the current configuration</dd>

<dt>PERFLAB_CONFIG_RUNPATH</dt>
<dd>the virtual root (or --prefix) of the installed daemon</dd>

<dt>PERFLAB_CONFIG_ID</dt>
<dd>the identifier for the current configuration</dd>

<dt>PERFLAB_RUN_ID</dt>
<dd>the identifier of the current run of tests</dd>

<dt>PERFLAB_TEST_ID</dt>
<dd>the identifier for this individual test</dd>

<dt>PERFLAB_CONFIG_NAME</dt>
<dd>the user specified name for this configuration</dd>

<dt>PERFLAB_CONFIG_BRANCH</dt>
<dd>the user-specified GIT/SVN branch for this configuration</dd>

<dt>PERFLAB_CONFIG_TYPE</dt>
<dd>the type of daemon under test (e.g. "BIND")</dd>

<dt>PERFLAB_CONFIG_PROTOCOL</dt>
<dd>the protocol being tested</dd>

<dt>PERFLAB_CONFIG_MODE</dt>
<dd>for DNS, (authoritative|recursive)</dd>

<dt>PERFLAB_TEST_COUNT</dt>
<dd>the sequence number of the current test</dd>

<dt>PERFLAB_TEST_MAX</dt>
<dd>the total number of tests to run in this sequence</dd>

</dl>
