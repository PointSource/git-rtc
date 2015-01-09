# Purpose

This project migrates RTC repositories to git, keeping the history.

# Install

To run the program, you must have `lscm` on your PATH.  `lscm` can be found on Jazz.net: (https://jazz.net/downloads/rational-team-concert/releases/5.0.2?p=allDownloads).  Look in the "Plain .zip Files" section for "SCM Tools"

Follow these steps to run the application.

    chmod +x bin/index.js

And while in your RTC component's directory, run the following command:

    RTC_USER=user RTC_PASSWORD=password AUTHOR="John Doe" DOMAIN="example.com" COMPONENT=foo path/to/git-rtc/bin/index.js

* RTC_USER is the user name you use to login to the repository
* RTC_PASSWORD is the password for your RTC user
* AUTHOR is your name. RTC does not give back author information for a changeset when the author is the current user
* DOMAIN is the default domain you wish to give your historic users in git
* COMPONENT is the RTC component

The application converts users into emails by transforming the name to lowercase and changing spaces to dots.
It then appeands '@' and DOMAIN.
Emails are needed for git history, but RTC does not have that information available.

# License

The MIT License (MIT)

Copyright (c) 2014 Zachary Allyn Kuhn

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
