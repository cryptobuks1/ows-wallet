'use strict';

angular.module('owsWalletApp').constant('pluginSchema',
{
  '$schema': 'http://json-schema.org/draft-06/schema#',
  'title': 'Plugin',
  'description': 'The representation of an OWS Wallet plugin.',
  'version': '0.0.1',
  'type': 'object',
  'required': [
    'header',
    'permissions',
    'galleryImage',
    'previewImage',
    'iconImage',
    'uri',
    'source'
  ],
  'properties': {
    'header': {
      'type': 'object',
      'required': [
        'created',
        'updated',
        'id',
        'kind',
        'name',
        'description',
        'version',
        'author',
        'url'
      ],
      'properties': {
        'created': {'type': 'number'},
        'updated': {'type': 'number'},
        'id': {'type': 'string'},
        'kind': {'type': 'string'},
        'name': {'type': 'string'},
        'description': {'type': 'string'},
        'author': {'type': 'string'},
        'version': {'type': 'string'},
        'url': {
          'type': 'object',
          'required': [
            'support',
            'privacy'
          ],
          'properties': {
            'marketing': {'type': 'string'},
            'support': {'type': 'string'},
            'privacy': {'type': 'string'},
            'terms': {'type': 'string'}
          }
        }
      }
    },
    'permissions': {
      'type': 'object',
      'properties': {
        'delete': {'type': 'boolean'}
      }
    },
    'skins': {'type': 'object'},
    'linkHostCss': {'type': 'boolean'},
    'galleryImage': {'type': 'string'},
    'previewImage': {'type': 'string'},
    'iconImage': {'type': 'string'},
    'launch': {
      'type': 'object',
      'properties': {
        'options': {'type': 'object'},
        'splash': {
          'type': 'object',
          'required': [
            'enabled'
          ],
          'properties': {
            'enabled':  {'type': 'boolean'},
            'image':  {'type': 'string'},
            'autoHide':  {'type': 'boolean'},
            'delay':  {'type': 'number'}
          }
        }
      }
    },
    'store': {
      'type': 'object',
      'required': [
        'id',
        'rating',
        'price',
        'category'
      ],
      'properties': {
        'id': {'type': 'string'},
        'rating': {'type': 'string'},
        'price': {
          'amount': {'type': 'string'},
          'currency': {'type': 'string'}
        },
        'category': {
          'type': 'object',
          'required': [
            'primary',
            'secondary'
          ],
          'properties': {
            'primary': {'type': 'string'},
            'secondary': {'type': 'string'}
          }
        },
        'keywords': {
          'type': 'array',
          'items': {'type': 'string'}
        }
      }
    },
    'resources': {
      'type': 'array',
      'items': {'type': 'string'}
    },
    'uri': {'type': 'string'},
    'source': {'type': 'string'},
    'configuration': {
      'type': 'object',
      'properties': {
        'flags': {'type': 'number'}
      }
    }
  }
});
