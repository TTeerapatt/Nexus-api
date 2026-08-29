pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    booleanParam(
      name: 'DEPLOY',
      defaultValue: true,
      description: 'Deploy ด้วย docker compose หลัง build สำเร็จ'
    )
    string(
      name: 'API_PORT',
      defaultValue: '3003',
      description: 'VPS port mapped to the API container (host:container → API_PORT:3003)'
    )
    string(
      name: 'CORS_ORIGIN',
      defaultValue: 'https://trpgls.com,https://www.trpgls.com',
      description: 'Allowed frontend origins, separated by commas'
    )
  }

  environment {
    COMPOSE_PROJECT_NAME = 'nexus-api'
    IMAGE_NAME = 'nexus-api'
    API_PORT = "${params.API_PORT}"
    PORT = '3003'
    CORS_ORIGIN = "${params.CORS_ORIGIN}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Validate') {
      steps {
        sh '''
          set -e
          # Keep runtime secrets in the server-side .env file.
          # Docker Compose loads this file automatically from the workspace.
          if [ ! -s .env ]; then
            echo ".env is required in the API workspace"
            exit 1
          fi

          has_value() {
            awk -F= -v key="$1" '$1 == key && $2 != "" { found=1 } END { exit(found ? 0 : 1) }' .env
          }

          if ! has_value JWT_SECRET; then
            echo "JWT_SECRET must be set in .env"
            exit 1
          fi

          if ! has_value DATABASE_URL && ! has_value DB_PASS; then
            echo "Set DATABASE_URL or DB_PASS in .env"
            exit 1
          fi
        '''
      }
    }

    stage('Build image') {
      steps {
        sh '''
          set -e
          export API_PORT="${API_PORT}"
          export PORT="${PORT}"
          export CORS_ORIGIN="${CORS_ORIGIN}"
          docker compose build api
        '''
      }
    }

    stage('Deploy') {
      when {
        expression { return params.DEPLOY == true }
      }
      steps {
        sh '''
          set -e
          export API_PORT="${API_PORT}"
          export PORT="${PORT}"
          export CORS_ORIGIN="${CORS_ORIGIN}"
          docker compose up -d --remove-orphans api
        '''
      }
    }

    stage('Health check') {
      when {
        expression { return params.DEPLOY == true }
      }
      steps {
        sh '''
          set -e
          echo "Waiting for API on :${API_PORT}/nexus/api/health ..."
          for i in $(seq 1 30); do
            code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/nexus/api/health" || true)"
            if echo "$code" | grep -Eq '^[123]'; then
              echo "API is healthy (HTTP $code)"
              exit 0
            fi
            if [ "$i" -eq 30 ]; then
              echo "API health check failed (HTTP $code)"
              docker compose ps || true
              docker compose logs --tail=80 api || true
              exit 1
            fi
            sleep 2
          done
        '''
      }
    }
  }

  post {
    success {
      echo "nexus-api #${env.BUILD_NUMBER} succeeded → https://trpgls.com/nexus/api/health"
    }
    failure {
      echo "nexus-api #${env.BUILD_NUMBER} failed"
      sh 'docker compose ps || true'
    }
  }
}
