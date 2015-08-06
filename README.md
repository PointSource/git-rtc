# Purpose

This project migrates RTC repositories to git, keeping the history.

# Install

## Jazz SCM tool
To run the program, you must have `lscm` on your PATH.  `lscm` can be found on Jazz.net: https://jazz.net/downloads/rational-team-concert/releases/5.0?p=allDownloads.  Look in the "Plain .zip Files" section for "SCM Tools".

* If you aren't using the IBM JVM, edit the scm.ini to remove the following 3 lines

```
-Xshareclasses:nonfatal
-Xquickstart
-Xdump:system:events=systhrow,filter=java/lang/OutOfMemoryError,request=exclusive+prepwalk
```

* Regardless of if you're using the IBM JVM, it's best to bump up the memory allowed for the scm commands. In scm.ini, look for the line like this: `-Xmx512m` and replace it with: `-Xmx2048m`

* If your installation of lscm didn't come with an scm.ini (Mac zips don't seem to have one), one is available within this repository at `config/scm.ini`

## Installation

If you have access to the PointSource npm registry, it's as easy as: `npm install git-rtc`

## Using the tool

### Create a config file

Check out the sample config file in `config/config.json` and note it's structure:
* "author" is the default author if none can be found for a given changeset (usually just the initial changeset)
* "domain" is the default domain to use for crafting email addresses for git commits. The application converts users into emails by transforming the name to lowercase and changing spaces to dots. It then appeands '@' and this domain. Emails are needed for git history, but RTC does not have that information available.
* "stream" is the stream the git repositories should be based on
* "repositories" is an array of repository names. These are folders that will be created on disk, so use appropriate names.
* "mapping" is an object with keys representing the components within the stream. The value for each key is an object mapping a source path (starting with the component folder within the workspace as a root folder) to a destination repository and path. See the sample for examples; this allows folders within a component to be split into separate repositories if desired.

### Setup

The tool requires a setup step which does the following:
* Creates a remote workspace
* Creates the local git repositories
* For each component in `config.mapping`, rolls the history back to the initial baseline
* Load the workspace locally
* Based on the mappings, creates an initial commit for each local git repository.

Note that the local files will end up in the current working directory, so run this command from where you'd like the local workspace and repositories to be stored.

Example: `git-rtc -U "you@pointsource.com" -P "YourJazzHubPassword" --config ../path/to/config.json setup`

#### Alternative setup

If you've already got a workspace created (via Eclipse or from a previous run) that is in a state you'd like to use for creating repositories, you can specify that as part of the setup command. The steps for creating a workspace and rolling it back will be skipped.

Example: `git-rtc -U "you@pointsource.com" -P "YourJazzHubPassword" --config ../path/to/config.json -w existing-workspace-name setup`

### Processing

Once setup is complete, the tool can be re-run using the `process` command as many times as is needed to update the git repositories. The process step does these actions for **each component** listed in `config.mapping`:
* Retrieve incoming changes for this workspace
* For each changeset within:
    * Accept the changeset into the workspace
    * Using the mapping, synchronize the workspace files to the git repository folders.
    * If `git status` indicates that there are changed files, add and commit them to the git repository using the information from the changeset

Note that this procesing action can be re-run as many times as needed. It could, for example, be run on a schedule on a CI server in order to keep a set of git repositories synchronized with a workspace/stream.

Example: `git-rtc -U "you@pointsource.com" -P "YourJazzHubPassword" --config ../path/to/config.json process`

# License

The MIT License (MIT)

Copyright (c) 2014 Zachary Allyn Kuhn, Benjamin Schell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
