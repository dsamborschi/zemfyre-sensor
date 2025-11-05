import React from 'react';

import {
  IoTPlatform as IoTPlatformView,
  Features as FeaturesView,
  Documentation as DocumentationView,
  Services as ServicesView,
  AboutPlatform as AboutPlatformView,
  StartDemo as StartDemoView,
  NotFoundCover as NotFoundCoverView,
} from 'views';

const routes = [
  {
    path: '/',
    renderer: (params = {}) => <IoTPlatformView {...params} />,
  },
  {
    path: '/features',
    renderer: (params = {}) => <FeaturesView {...params} />,
  },
  {
    path: '/docs',
    renderer: (params = {}) => <DocumentationView {...params} />,
  },
  {
    path: '/services',
    renderer: (params = {}) => <ServicesView {...params} />,
  },
  {
    path: '/pricing',
    renderer: (params = {}) => <ServicesView {...params} />,
  },
  {
    path: '/about',
    renderer: (params = {}) => <AboutPlatformView {...params} />,
  },
  {
    path: '/start-demo',
    renderer: (params = {}) => <StartDemoView {...params} />,
  },
  {
    path: '/not-found-cover',
    renderer: (params = {}) => <NotFoundCoverView {...params} />,
  },
  {
    path: '*',
    renderer: (params = {}) => <NotFoundCoverView {...params} />,
  },
];

export default routes;
