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
      description: 'พอร์ตบน VPS ที่ map ไป container API (host:container → API_PORT:3003)'
    )
    string(
      name: 'CORS_ORIGIN',
      defaultValue: '*',
      description: 'Origin ของ frontend ที่อนุญาต (คั่นด้วย comma ได้ หรือ * )'
    )
    string(
      name: 'DATABASE_URL',
      defaultValue: 'postgres://postgres:0946987087Notkz%23@187.52.125.210:5432/nexus',
      description: 'Connection string ของ PostgreSQL (ถ้า password มี # ให้ใส่เป็น %23)'
    )
    string(
      name: 'DB_HOST',
      defaultValue: '187.52.125.210',
      description: 'ใช้เมื่อไม่ใส่ DATABASE_URL'
    )
    string(
      name: 'DB_PORT',
      defaultValue: '5432',
      description: 'พอร์ต Postgres'
    )
    string(
      name: 'DB_USER',
      defaultValue: 'postgres',
      description: 'user Postgres'
    )
    password(
      name: 'DB_PASS',
      defaultValue: '0946987087Notkz#',
      description: 'รหัสผ่าน Postgres (ใช้เมื่อไม่พึ่ง DATABASE_URL หรือเป็นค่าสำรอง)'
    )
    string(
      name: 'DB_NAME',
      defaultValue: 'nexus',
      description: 'ชื่อ database'
    )
    password(
      name: 'JWT_SECRET',
      defaultValue: 'CHicNaFWTEhJz0bT4O6xqDvX428f3J3bMi5giXWbSqU',
      description: 'JWT secret สำหรับเซ็น token (จำเป็นต้องใส่)'
    )
    string(
      name: 'JENKINS_BASE_URL',
      defaultValue: 'http://187.52.125.210:8080',
      description: 'Jenkins base URL สำหรับ CI-CD proxy'
    )
    string(
      name: 'JENKINS_USER',
      defaultValue: 'not778',
      description: 'Jenkins user'
    )
    password(
      name: 'JENKINS_API_TOKEN',
      defaultValue: '11575f6e0b5e1984ca20bd62f14f2a148c',
      description: 'Jenkins API token'
    )
  }

  environment {
    COMPOSE_PROJECT_NAME = 'nexus-api'
    IMAGE_NAME = 'nexus-api'
    API_PORT = "${params.API_PORT}"
    PORT = '3003'
    CORS_ORIGIN = "${params.CORS_ORIGIN}"
    DATABASE_URL = "${params.DATABASE_URL}"
    DB_HOST = "${params.DB_HOST}"
    DB_PORT = "${params.DB_PORT}"
    DB_USER = "${params.DB_USER}"
    DB_PASS = "${params.DB_PASS}"
    DB_NAME = "${params.DB_NAME}"
    JWT_SECRET = "${params.JWT_SECRET}"
    JENKINS_BASE_URL = "${params.JENKINS_BASE_URL}"
    JENKINS_USER = "${params.JENKINS_USER}"
    JENKINS_API_TOKEN = "${params.JENKINS_API_TOKEN}"
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
          if [ -z "${JWT_SECRET}" ]; then
            echo "JWT_SECRET is required"
            exit 1
          fi

          has_url=0
          case "${DATABASE_URL}" in
            ""|"postgres://postgres:CHANGE_ME@"*) has_url=0 ;;
            *) has_url=1 ;;
          esac

          if [ "${has_url}" -eq 0 ] && [ -z "${DB_PASS}" ]; then
            echo "Provide a real DATABASE_URL (encode # as %23) or set DB_PASS"
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
          export DATABASE_URL="${DATABASE_URL}"
          export DB_HOST="${DB_HOST}"
          export DB_PORT="${DB_PORT}"
          export DB_USER="${DB_USER}"
          export DB_PASS="${DB_PASS}"
          export DB_NAME="${DB_NAME}"
          export JWT_SECRET="${JWT_SECRET}"
          export JENKINS_BASE_URL="${JENKINS_BASE_URL}"
          export JENKINS_USER="${JENKINS_USER}"
          export JENKINS_API_TOKEN="${JENKINS_API_TOKEN}"
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
          export DATABASE_URL="${DATABASE_URL}"
          export DB_HOST="${DB_HOST}"
          export DB_PORT="${DB_PORT}"
          export DB_USER="${DB_USER}"
          export DB_PASS="${DB_PASS}"
          export DB_NAME="${DB_NAME}"
          export JWT_SECRET="${JWT_SECRET}"
          export JENKINS_BASE_URL="${JENKINS_BASE_URL}"
          export JENKINS_USER="${JENKINS_USER}"
          export JENKINS_API_TOKEN="${JENKINS_API_TOKEN}"
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
      echo "nexus-api #${env.BUILD_NUMBER} succeeded → http://187.52.125.210:${params.API_PORT}/nexus/api/health"
    }
    failure {
      echo "nexus-api #${env.BUILD_NUMBER} failed"
      sh 'docker compose ps || true'
    }
  }
}
