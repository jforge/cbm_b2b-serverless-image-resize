FROM centos:7

# Updates and Tooling
RUN yum -y update
RUN yum -y install epel-release
RUN yum -y install wget
RUN yum -y install unzip
RUN yum -y install which

# Node8.x
RUN curl --silent --location https://rpm.nodesource.com/setup_8.x | bash -
RUN wget https://dl.yarnpkg.com/rpm/yarn.repo -O /etc/yum.repos.d/yarn.repo
RUN yum -y install nodejs
RUN yum -y install yarn
RUN npm install -g serverless@1.27

# AWS CLI
RUN yum -y install awscli
RUN mkdir /root/.aws/
RUN echo -e "[default]\nregion=eu-west-1" >> /root/.aws/config

