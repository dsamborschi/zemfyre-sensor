## Run ansible script inside of a Docker container
docker build -t ansible-deploy C:\Users\Dan\zemfyre-sensor\ansible
docker run --rm -it --env-file C:\Users\Dan\zemfyre-sensor\.env -e ANSIBLE_HOST_KEY_CHECKING=False -v C:\Users\Dan\zemfyre-sensor:/workspace ansible-deploy ansible-playbook -i /workspace/ansible/hosts.ini /workspace/ansible/deploy.yml